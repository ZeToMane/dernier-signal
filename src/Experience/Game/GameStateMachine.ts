/**
 * GameStateMachine — the flow of the whole experience.
 *
 *   loading ──assetsReady()──► idle ◄──────────────────────────────┐
 *                               │ ▲                                │
 *               enterSetup()    │ │ leaveSetup()                   │
 *                               ▼ │                                │
 *                             setup                                │
 *                                                                  │
 *   idle ──first hit (all objects connected)──► playing            │
 *   playing ──inactivity / object lost / abortRound()──► idle      │
 *   playing ──rolling accuracy >= threshold──► buildup             │
 *   buildup ──audio clock reaches the drop──► party                │
 *   party ──drop track finished + partyHold──────────────────────►─┘
 *
 * - idle    : the loop plays alone, waiting for someone to touch an object.
 * - playing : notes fall, the Judge grades hits, success is checked every frame.
 * - buildup : success reached; the drop is scheduled on the next loop boundary.
 *             (use `dropAt` + the 'dropScheduled' event for a crescendo effect)
 * - party   : the drop is playing; lights, visuals.
 *
 * The machine owns WHEN things happen. It does not draw, and it does not play
 * the objects' samples: your glue code does that.
 *
 * Glue code must call:
 *   - onDeviceHit(device, perfMs)  for each object event
 *   - setDeviceConnected(...)      when a serial port connects / disconnects
 *   - update()                     once per frame
 */

import type { AudioEngine } from "../Audio/AudioEngine";
import { chartDevices, type Chart } from "./Chart";
import type { Conductor } from "./Conductor";
import { Emitter } from "./Emitter";
import type { Judge } from "./Judge";

export type GameState =
    | "loading"
    | "setup"
    | "idle"
    | "playing"
    | "buildup"
    | "party";

export interface GameConfig {
    /** Objects that must be connected to start a round. Default: every device used by the chart. */
    requiredDevices: string[];
    /**
     * Rolling accuracy needed to trigger the drop, in [0, 1].
     * Tip: with N objects, a threshold above (N-1)/N cannot be reached if one
     * object is never played, so it forces everyone to take part.
     */
    successThreshold: number;
    /** Minimum number of judged notes before success can trigger. Default: the Judge's rolling window. */
    minJudgedNotes: number;
    /** Seconds without any hit before a round is abandoned (back to idle). */
    inactivityTimeout: number;
    /** Seconds to keep the party going after the drop track ends. */
    partyHold: number;
}

export interface StateChange {
    from: GameState;
    to: GameState;
    reason: string;
}

export interface GameEvents {
    state: StateChange;
    /** `at` is an AudioContext time (compare with audio.currentTime). */
    dropScheduled: { at: number };
}

export interface GameDeps {
    conductor: Pick<Conductor, "start" | "stop">;
    judge: Pick<
        Judge,
        "reset" | "update" | "onHit" | "accuracy" | "sampleCount" | "windowSize"
    >;
    audio: Pick<
        AudioEngine,
        "scheduleDropAtNextLoop" | "currentTime" | "duration"
    >;
    chart: Chart;
    config?: Partial<GameConfig>;
    /** Millisecond clock, injectable for tests. Default: performance.now(). */
    now?: () => number;
}

export class GameStateMachine extends Emitter<GameEvents> {
    readonly config: GameConfig;

    private state_: GameState = "loading";
    private readonly connected = new Set<string>();
    private loopRunning = false;
    private lastHitAt = 0;
    private dropAt_: number | null = null;
    private partyEndsAt = 0;

    private readonly conductor: GameDeps["conductor"];
    private readonly judge: GameDeps["judge"];
    private readonly audio: GameDeps["audio"];
    private readonly chart: Chart;
    private readonly now: () => number;

    constructor(deps: GameDeps) {
        super();
        this.conductor = deps.conductor;
        this.judge = deps.judge;
        this.audio = deps.audio;
        this.chart = deps.chart;
        this.now = deps.now ?? (() => performance.now());

        const c = deps.config ?? {};
        this.config = {
            requiredDevices: c.requiredDevices ?? chartDevices(deps.chart),
            successThreshold: c.successThreshold ?? 0.75,
            minJudgedNotes: c.minJudgedNotes ?? deps.judge.windowSize,
            inactivityTimeout: c.inactivityTimeout ?? 20,
            partyHold: c.partyHold ?? 4,
        };
    }

    // ---------------------------------------------------------------------------
    // Read-only state
    // ---------------------------------------------------------------------------

    get state(): GameState {
        return this.state_;
    }

    /** AudioContext time at which the drop starts (set from 'buildup' on, else null). */
    get dropAt(): number | null {
        return this.dropAt_;
    }

    allDevicesConnected(): boolean {
        return this.missingDevices().length === 0;
    }

    missingDevices(): string[] {
        return this.config.requiredDevices.filter(
            (d) => !this.connected.has(d),
        );
    }

    // ---------------------------------------------------------------------------
    // Commands from the rest of the app
    // ---------------------------------------------------------------------------

    /**
     * Call once the AudioEngine is unlocked and the files are loaded.
     * Starts the loop and enters idle.
     */
    assetsReady(): void {
        if (this.state_ !== "loading") return;
        this.go("idle", "assets ready");
    }

    /** Staff screen (connect objects, calibrate). Only from idle. */
    enterSetup(): void {
        if (this.state_ === "idle") this.go("setup", "staff opened setup");
    }

    leaveSetup(): void {
        if (this.state_ === "setup") this.go("idle", "staff closed setup");
    }

    /** Cancel the current round (e.g. staff reset key). Only during 'playing'. */
    abortRound(reason = "aborted"): void {
        if (this.state_ === "playing") this.go("idle", reason);
    }

    setDeviceConnected(device: string, connected: boolean): void {
        if (connected) {
            this.connected.add(device);
            return;
        }
        this.connected.delete(device);
        if (
            this.state_ === "playing" &&
            this.config.requiredDevices.includes(device)
        ) {
            this.go("idle", `object lost: ${device}`);
        }
    }

    /** An object fired. `perfMs` = performance.now() taken when the event was received. */
    onDeviceHit(device: string, perfMs: number): void {
        switch (this.state_) {
            case "idle":
                // The touch that wakes the game is not judged.
                if (this.allDevicesConnected())
                    this.go("playing", `first hit from ${device}`);
                break;
            case "playing":
                this.lastHitAt = this.now();
                this.judge.onHit(device, perfMs);
                break;
            default:
                break; // loading / setup / buildup / party: ignore for gameplay
        }
    }

    /** Call every frame (requestAnimationFrame). */
    update(): void {
        switch (this.state_) {
            case "playing":
                this.updatePlaying();
                break;
            case "buildup":
                if (
                    this.dropAt_ !== null &&
                    this.audio.currentTime >= this.dropAt_
                ) {
                    this.go("party", "drop started");
                }
                break;
            case "party":
                if (this.audio.currentTime >= this.partyEndsAt)
                    this.go("idle", "party over");
                break;
            default:
                break;
        }
    }

    // ---------------------------------------------------------------------------

    private updatePlaying(): void {
        this.judge.update(); // turns unplayed notes into misses

        const idleFor = (this.now() - this.lastHitAt) / 1000;
        if (idleFor > this.config.inactivityTimeout) {
            this.go("idle", "inactivity");
            return;
        }

        const enoughNotes =
            this.judge.sampleCount() >= this.config.minJudgedNotes;
        if (
            enoughNotes &&
            this.judge.accuracy() >= this.config.successThreshold
        ) {
            this.go("buildup", "success threshold reached");
        }
    }

    /** Every transition goes through here: entry actions first, then the event. */
    private go(to: GameState, reason: string): void {
        const from = this.state_;
        if (from === to) return;
        this.state_ = to;

        switch (to) {
            case "idle":
                this.ensureLoop();
                this.judge.reset();
                this.dropAt_ = null;
                break;

            case "playing":
                this.judge.reset();
                this.lastHitAt = this.now();
                break;

            case "buildup": {
                const at = this.audio.scheduleDropAtNextLoop(this.chart.dropId);
                this.dropAt_ = at;
                this.loopRunning = false; // the engine stops the loop at `at`
                this.emit("dropScheduled", { at });
                break;
            }

            case "party":
                this.partyEndsAt =
                    (this.dropAt_ ?? this.audio.currentTime) +
                    this.audio.duration(this.chart.dropId) +
                    this.config.partyHold;
                break;

            default:
                break;
        }

        this.emit("state", { from, to, reason });
    }

    private ensureLoop(): void {
        if (this.loopRunning) return;
        this.conductor.start(this.chart.loopId);
        this.loopRunning = true;
    }
}

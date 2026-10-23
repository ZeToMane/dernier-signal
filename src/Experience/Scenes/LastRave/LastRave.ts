import * as THREE from "three";
import Scene from "../../Scene";
import { GameExperience } from "../../Game/GameExperience";
import {
    createDebugPanel,
    DEFAULT_LIGHTING_PARAMS,
} from "./debug/createDebugPanel";
import { Hud, loadHudFonts } from "./hud/Hud";
import {
    designToScreen,
    designToScreenLength,
    GLOBE,
    PALETTE,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
    setAccent,
    type AccentName,
} from "./layout";
import { createCameraRig, DEFAULT_CAMERA_MOTION } from "./objects/cameraMotion";
import { applySpecularAATo, specularAA } from "./objects/specularAA";
import { setTexturesEnabled } from "./objects/textureToggle";
import { createSoundDesign, DEFAULT_SOUND_DESIGN } from "./audio/soundDesign";
import {
    createPostFx,
    DEFAULT_POSTFX_PARAMS,
    type PostFx,
} from "./postfx/createPostFx";
import { createGlobe } from "./objects/createGlobe";
import {
    createPoster,
    DEFAULT_POSTER_PARAMS,
    type Poster,
} from "./objects/createPoster";
import { createEnvironment, type BunkerEnvironment } from "./objects/environment/createEnvironment";
import { applySteelTextures } from "./objects/environment/shared";
import {
    createScreen,
    SCREEN_SURFACE_Z,
    type Screen,
} from "./objects/createScreen";
import {
    applyWallLightParams,
    applyWallTextures,
    createWall,
    DEFAULT_WALL_LIGHT_PARAMS,
} from "./objects/createWall";

const SCREEN_Z = 0.06;
/** Share of the viewport the screen should fill, taken from the mockup. */
const SCREEN_FILL = 0.82;
/** screenGlow only hits wall / steel — never the HUD glass (avoids the center hot disc). */
const GLOW_LAYER = 1;

/** Two flashlights wandering over the screen — people sweeping it with torches. */
/**
 * Three torches exploring the HUD border on a fixed loop — scared people
 * checking the dark: slow creeping sweeps, stops to look, quick nervous darts.
 */
export type FlashlightParams = {
    /** Off = torches parked at their loop start, no sweep / tremor. */
    moving: boolean;
    /** Duration of one loop (seconds) — every torch replays its path on this clock. */
    period: number;
    /** Distance from the HUD border, as a multiple of the path reach (1 = as authored). */
    spread: number;
    /** Distance in front of the wall. */
    z: number;
    /** Nervous hand shake amplitude. */
    tremor: number;
    /** Share of "Glow écran" each torch gets. */
    share: number;
    /** How much each torch's power drifts over time (0 = steady). */
    variation: number;
    /** Seconds after pressing L before the first torch clicks on. */
    switchOnDelay: number;
    /** Seconds between each torch switching on. */
    switchOnStagger: number;
    /** Torch level before the screen is on (fraction of the full level). */
    idlePower: number;
    /** Beam color before the screen is on (blends to green as it boots). */
    idleColor: string;
};

export const DEFAULT_FLASHLIGHT_PARAMS: FlashlightParams = {
    moving: true,
    period: 26,
    spread: 1,
    z: 0.55,
    tremor: 0.03,
    share: 0.5,
    variation: 0.35,
    switchOnDelay: 0.15,
    switchOnStagger: 0.85,
    idlePower: 0.6,
    idleColor: "#d4e2da",
};

/**
 * Keyframes: [angle° around the HUD (0 = right, 90 = top), reach (1 = on the
 * border, > 1 outside), duration weight, hold fraction]. Each key holds (looks),
 * then eases to the next. Short weights = nervous darts.
 */
type TorchKey = [angle: number, reach: number, weight: number, hold: number];

/** Point on the HUD rectangle border (half-size units) — corners included, never inside. */
const onBorder = (deg: number, reach: number): [number, number] => {
    const a = THREE.MathUtils.degToRad(deg);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const m = Math.max(Math.abs(c), Math.abs(s));
    return [(c / m) * reach, (s / m) * reach];
};

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function keyedPath(keys: TorchKey[]) {
    const total = keys.reduce((sum, key) => sum + key[2], 0);
    return (u: number): [number, number] => {
        let start = 0;
        for (let i = 0; i < keys.length; i++) {
            const [angle, reach, weight, hold] = keys[i];
            const span = weight / total;
            if (u < start + span || i === keys.length - 1) {
                const f = Math.min(1, (u - start) / span);
                const t = easeInOutCubic(Math.max(0, (f - hold) / (1 - hold)));
                const [nextAngle, nextReach] = keys[(i + 1) % keys.length];
                return onBorder(angle + (nextAngle - angle) * t, reach + (nextReach - reach) * t);
            }
            start += span;
        }
        return onBorder(keys[0][0], keys[0][1]);
    };
}

/**
 * One zone of the border per torch (never close: ≥ ~1 apart, checked offline),
 * together they reach all four sides every loop.
 * - A: top + top-right. B: left side. C: bottom + bottom-right.
 * `size` scales the distance to the wall (closer = tighter spot), `power` the
 * intensity, `decay` the falloff sharpness.
 */
const FLASHLIGHT_SEEDS = [
    {
        path: keyedPath([
            [118, 1.03, 3.2, 0.45],
            [104, 1.08, 0.7, 0.2],
            [66, 1.02, 4, 0.35],
            [80, 1.1, 0.6, 0.15],
            [36, 1.04, 3.6, 0.5],
            [58, 1.06, 1.4, 0.3],
        ]),
        phase: 0,
        size: 1,
        power: 1,
        decay: 1.4,
    },
    {
        path: keyedPath([
            [158, 1.04, 3, 0.5],
            [200, 1.02, 4.2, 0.35],
            [186, 1.1, 0.6, 0.15],
            [226, 1.05, 3.4, 0.45],
            [172, 1.08, 1.2, 0.25],
        ]),
        phase: 2.4,
        size: 0.8,
        power: 0.75,
        decay: 1.6,
    },
    {
        path: keyedPath([
            [256, 1.03, 3.6, 0.4],
            [292, 1.08, 0.7, 0.15],
            [330, 1.02, 4, 0.45],
            [312, 1.1, 0.6, 0.2],
            [276, 1.05, 3.2, 0.35],
        ]),
        phase: 4.1,
        size: 0.6,
        power: 0.55,
        decay: 1.8,
    },
];

type Globe = ReturnType<typeof createGlobe>;

export default class LastRave extends Scene {
    ready = false;

    hud!: Hud;
    game = new GameExperience();
    globe!: Globe;
    poster!: Poster;
    wall!: THREE.Mesh;
    screen!: Screen;
    environment!: BunkerEnvironment;
    /** First torch — also drives the poster shader. */
    screenGlow!: THREE.PointLight;
    flashlights: THREE.PointLight[] = [];
    flashlightParams = { ...DEFAULT_FLASHLIGHT_PARAMS };
    roomLight!: THREE.PointLight;
    topLight!: THREE.DirectionalLight;
    ambientLight!: THREE.AmbientLight;
    /** Debug only — floods the whole scene to inspect geometry / textures. */
    debugFill!: THREE.HemisphereLight;
    debugKey!: THREE.DirectionalLight;
    debugLight = { enabled: false, intensity: 3 };
    /** Same rig as the debug flood, tinted bunker green — a faint always-on base. */
    greenFill!: THREE.HemisphereLight;
    greenKey!: THREE.DirectionalLight;
    greenLight = {
        enabled: true,
        intensity: 0.1,
        /** Ambient (hemisphere) vs directional split — 0 = all directional, 1 = all ambient. */
        ambientShare: 0.3,
        color: PALETTE.green as string,
        /** Where the directional comes from (only its direction matters, not its distance). */
        dirX: 0.45,
        dirY: 0.85,
        dirZ: 8.3,
    };
    postFx!: PostFx;
    postFxParams = structuredClone(DEFAULT_POSTFX_PARAMS);
    lastFlicker = 1;

    cameraMotion = { ...DEFAULT_CAMERA_MOTION };
    cameraRig = createCameraRig(this.cameraMotion);
    soundParams = { ...DEFAULT_SOUND_DESIGN };
    sound = createSoundDesign(this.game.audio, this.soundParams);
    posterParams = { ...DEFAULT_POSTER_PARAMS };
    lightingParams = { ...DEFAULT_LIGHTING_PARAMS };
    wallLightParams = { ...DEFAULT_WALL_LIGHT_PARAMS };
    posterMap: THREE.Texture | null = null;
    posterNormalMap: THREE.Texture | null = null;
    posterRoughnessMap: THREE.Texture | null = null;
    posterNormal = { enabled: true };
    screenRoughness = { enabled: true };
    textures = { enabled: true };
    accent = { pink: false };
    screenOverlayMap: THREE.Texture | null = null;
    posterViewHeight = 1;
    cameraDistance = 0;

    screenPower = 0;
    screenPowerTarget = 0;
    powerOnTimer = 0;
    /** When L was pressed (s) — torches click on in sequence after it. Off until then. */
    private torchesReadyAt = Infinity;
    private readonly torchSwitched = [false, false, false];
    /** Pending poster take-off while the wind sound leads in. */
    flyTimer = 0;
    /** Previous frame's merge-glitch level (fires the drop glitch sound on the rising edge). */
    private lastMergeGlitch = 0;
    globeShown = false;

    // Wind punch: snap right+down, then slow dazed ease back to center.
    punch: { elapsed: number } | null = null;
    punchX = 0;
    punchY = 0;
    punchZ = 0;
    punchRoll = 0;

    // Scratch for poster ↔ scene light sync (view space).
    private readonly _lightDir = new THREE.Vector3();
    private readonly _roomViewPos = new THREE.Vector3();
    private readonly _glowViewPos = new THREE.Vector3();
    private readonly _ambientColor = new THREE.Color();
    private readonly _keyColor = new THREE.Color();
    private readonly _roomColor = new THREE.Color();
    private readonly _glowColor = new THREE.Color();
    private readonly _greenAmbient = new THREE.Color();
    private readonly _torchIdle = new THREE.Color();
    private readonly _torchLive = new THREE.Color(PALETTE.green);

    constructor() {
        super();

        loadHudFonts().then(() => this.init());
    }

    init() {
        this.setHud();
        this.setObjects();
        this.setLights();
        this.setPostFx();
        this.setTextures();
        this.setDebug();
        this.bindRhythm();
        this.syncCustomLights();

        this.experience.sizes.on("resize", () => this.resize());
        this.resize();

        this.ready = true;
    }

    bindRhythm() {
        this.game.whenChartReady((chart, loopDuration) => {
            this.hud.setRhythmChart(chart.notes, loopDuration);
        });
        this.game.whenHit((lane, noteTime, absSongTime) => {
            this.hud.registerRhythmHit(lane, noteTime, absSongTime);
        });
    }

    get maxAnisotropy() {
        return this.experience.renderer.instance.capabilities.getMaxAnisotropy();
    }

    setHud() {
        this.hud = new Hud();
        this.hud.texture.anisotropy = this.maxAnisotropy;
        this.hud.draw();
    }

    setObjects() {
        this.screen = createScreen(this.hud.texture);
        this.screen.group.position.z = SCREEN_Z;

        this.globe = createGlobe();
        const globePosition = designToScreen(GLOBE.x, GLOBE.y);
        this.globe.group.position.set(
            globePosition.x,
            globePosition.y,
            SCREEN_SURFACE_Z + 0.01,
        );
        this.globe.setScale(designToScreenLength(GLOBE.radius));
        this.screen.group.add(this.globe.group);

        this.poster = createPoster(this.posterParams);
        this.wall = createWall();
        this.environment = createEnvironment();

        this.experience.scene.background = new THREE.Color("#010302");
        this.container.add(
            this.wall,
            this.environment.group,
            this.screen.group,
            this.poster.mesh,
        );

        // Fine normal maps sparkle when the camera moves — widen sub-pixel highlights.
        applySpecularAATo(this.wall);
        applySpecularAATo(this.environment.group);
        applySpecularAATo(this.screen.group);

        // Wall + steel receive the green glow; HUD glass stays on layer 0 only.
        this.wall.layers.enable(GLOW_LAYER);
        this.environment.group.traverse((obj) => obj.layers.enable(GLOW_LAYER));
        this.screen.group.traverse((obj) => obj.layers.set(0));
    }

    setLights() {
        // Green wash on concrete / steel — layer-masked so it never hits the HUD plane.
        this.flashlights = FLASHLIGHT_SEEDS.map((seed) => {
            const light = new THREE.PointLight(PALETTE.green, 0, 7, seed.decay);
            light.position.set(0, 0.05, this.flashlightParams.z);
            light.layers.set(GLOW_LAYER);
            return light;
        });
        this.screenGlow = this.flashlights[0];

        // Dim fill only while the poster is up / screen off.
        this.roomLight = new THREE.PointLight(
            "#6a7a72",
            this.lightingParams.room,
            8,
            2,
        );
        this.roomLight.position.set(0, 0.2, 1.4);

        this.topLight = new THREE.DirectionalLight(
            "#6a7a72",
            this.lightingParams.key,
        );
        this.topLight.position.set(0.8, 1.6, 2.5);

        this.ambientLight = new THREE.AmbientLight(
            "#1c2420",
            this.lightingParams.ambient,
        );


        this.debugFill = new THREE.HemisphereLight("#ffffff", "#808080", 0);
        this.debugKey = new THREE.DirectionalLight("#ffffff", 0);
        this.debugKey.position.set(0.5, 1, 5);

        this.greenFill = new THREE.HemisphereLight(PALETTE.green, PALETTE.greenShade, 0);
        this.greenKey = new THREE.DirectionalLight(PALETTE.green, 0);

        this.experience.camera.instance.layers.enable(GLOW_LAYER);

        this.container.add(
            ...this.flashlights,
            this.roomLight,
            this.topLight,
            this.ambientLight,
            this.debugFill,
            this.debugKey,
            this.greenFill,
            this.greenKey,
        );
    }

    setPostFx() {
        const renderer = this.experience.renderer;
        this.postFx = createPostFx(
            renderer.instance,
            this.experience.scene,
            this.experience.camera.instance,
            this.postFxParams,
        );
        this.postFx.setSize(this.experience.sizes.width, this.experience.sizes.height);
        renderer.postProcess = this.postFxParams.enabled ? this.postFx : null;

        this.hud.onTrigger = () => this.postFx.kick(0.35);
        this.hud.onSfx = (cue) => this.sound.play(cue);
    }

    setTextures() {
        const resources = this.experience.resources;
        const apply = () => {
            const poster = resources.items.posterTexture as THREE.Texture;
            poster.colorSpace = THREE.SRGBColorSpace;
            poster.anisotropy = this.maxAnisotropy;
            this.posterMap = poster;

            const posterNormal = resources.items.posterNormal as THREE.Texture;
            posterNormal.colorSpace = THREE.NoColorSpace;
            posterNormal.anisotropy = this.maxAnisotropy;
            this.posterNormalMap = posterNormal;

            const posterRoughness = resources.items
                .posterRoughness as THREE.Texture;
            posterRoughness.colorSpace = THREE.NoColorSpace;
            posterRoughness.anisotropy = this.maxAnisotropy;
            this.posterRoughnessMap = posterRoughness;

            this.applyPosterMap();

            applyWallTextures(
                this.wall,
                {
                    albedo: resources.items.concreteAlbedo as THREE.Texture,
                    roughness: resources.items
                        .concreteRoughness as THREE.Texture,
                    normal: resources.items.concreteNormal as THREE.Texture,
                },
                this.maxAnisotropy,
                this.wallLightParams,
            );

            applySteelTextures(
                this.environment.materials,
                {
                    albedo: resources.items.steelAlbedo as THREE.Texture,
                    roughness: resources.items.steelRoughness as THREE.Texture,
                    normal: resources.items.steelNormal as THREE.Texture,
                },
                this.maxAnisotropy,
            );

            this.environment.setPanelTextures(
                {
                    albedo: resources.items.boxAlbedo as THREE.Texture,
                    normal: resources.items.boxNormal as THREE.Texture,
                    roughness: resources.items.boxRoughness as THREE.Texture,
                },
                this.maxAnisotropy,
            );

            this.environment.cables.setTextures(
                {
                    albedo: resources.items.cableAlbedo as THREE.Texture,
                    normal: resources.items.cableNormal as THREE.Texture,
                    roughness: resources.items.cableRoughness as THREE.Texture,
                },
                this.maxAnisotropy,
            );

            const screenOverlay = resources.items
                .screenOverlay as THREE.Texture;
            screenOverlay.colorSpace = THREE.SRGBColorSpace;
            screenOverlay.anisotropy = this.maxAnisotropy;
            this.screenOverlayMap = screenOverlay;
            this.screen.setOverlay(screenOverlay);

            const screenRoughness = resources.items
                .screenRoughness as THREE.Texture;
            screenRoughness.colorSpace = THREE.NoColorSpace;
            screenRoughness.anisotropy = this.maxAnisotropy;
            this.screen.setRoughnessMap(screenRoughness);
            this.screen.setRoughnessEnabled(this.screenRoughness.enabled);
        };

        if (resources.isReady) apply();
        else resources.on("ready", apply);
    }

    /** Poster gust → peel → fly off → screen boots (key A / debug button). */
    flyPoster() {
        if (this.poster.gone || this.poster.flying || this.flyTimer) return;
        // The gust is heard first, the poster goes a beat later.
        this.sound.play({ type: "poster-wind" });
        this.flyTimer = window.setTimeout(() => {
            this.flyTimer = 0;
            if (this.poster.gone || this.poster.flying) return;
            this.poster.fly();
            // Paper rips as it peels off, just before it detaches (punch hit).
            window.setTimeout(
                () => this.sound.play({ type: "poster-rip" }),
                Math.max(0.02, this.posterParams.windCamHit) * 500,
            );
            this.punch = { elapsed: 0 };
            this.postFx.kick(1);
            this.cameraRig.startle(1);
            // Screen boots 200ms after the poster starts peeling off.
            this.powerOnTimer = window.setTimeout(
                () => this.powerOn(),
                Math.max(0.02, this.posterParams.windCamHit) * 1000 + 200,
            );
        }, Math.max(0, this.posterParams.windSoundLead) * 1000);
    }

    /** 0 = intro, 1..3 = objects found, 4 = network reactivated (keys Z / E / R / T). */
    setSignalStage(count: number) {
        if (count > 0 && !this.hud.isPowered) this.powerOn();
        this.hud.setSignalStage(count);
        if (count > 0) {
            this.postFx.kick(count >= 4 ? 1 : 0.6);
            this.cameraRig.startle(count >= 4 ? 0.9 : 0.4);
        }
        // Music starts on first signal object, not on the base "fête" screen.
        if (count >= 1) this.game.startLoop();
        if (count >= 4) this.game.playDrop();
    }

    /**
     * Show controls by typed character (AZERTY-safe): L torches, A poster, Z / E / R signals
     * 1-3, T network reactivated (end). H toggles the hidden debug panel.
     */
    bindShowKeys(pane: { hidden: boolean }) {
        window.addEventListener("keydown", (event) => {
            if (event.repeat) return;
            if (event.target instanceof HTMLInputElement) return;
            if (event.target instanceof HTMLTextAreaElement) return;
            switch (event.key.toLowerCase()) {
                case "a":
                    this.flyPoster();
                    break;
                case "z":
                    this.setSignalStage(1);
                    break;
                case "e":
                    this.setSignalStage(2);
                    break;
                case "r":
                    this.setSignalStage(3);
                    break;
                case "t":
                    this.setSignalStage(4);
                    break;
                case "l":
                    this.switchOnTorches();
                    break;
                case "h":
                    pane.hidden = !pane.hidden;
                    break;
            }
        });
    }

    setDebug() {
        const pane = createDebugPanel(
            this.hud,
            this.cameraMotion,
            this.posterParams,
            this.lightingParams,
            this.wallLightParams,
            {
                onWallLightChange: () =>
                    applyWallLightParams(this.wall, this.wallLightParams),
                onGlobeBoost: () => this.globe.triggerBoost(),
                onPosterFly: () => this.flyPoster(),
                onPosterReset: () => {
                    if (this.poster.gone) this.spawnPoster();
                    else this.poster.reset();
                    this.resetPunch();
                    this.powerOff();
                },
                onSignalStage: (count) => this.setSignalStage(count),
                onPosterNormalToggle: (enabled) => {
                    this.posterNormal.enabled = enabled;
                    this.poster.setNormalEnabled(enabled);
                },
                onScreenRoughnessToggle: (enabled) => {
                    this.screenRoughness.enabled = enabled;
                    this.screen.setRoughnessEnabled(enabled);
                },
                onTexturesToggle: (enabled) => this.setTexturesEnabled(enabled),
                onAccentToggle: (pink) => this.setAccent(pink ? "pink" : "green"),
            },
            this.posterNormal,
            this.screenRoughness,
            this.textures,
            this.accent,
            this.flashlightParams,
            this.debugLight,
            this.greenLight,
            this.environment.cables,
            {
                params: this.postFxParams,
                onToggle: (enabled) => {
                    this.experience.renderer.postProcess = enabled ? this.postFx : null;
                },
                testKick: () => this.postFx.kick(1),
                testGlitch: (wild) => this.postFx.glitch(wild),
                specularAA,
                sound: this.soundParams,
            },
        );
        // Hidden for the show — H brings it back.
        pane.hidden = true;
        this.bindShowKeys(pane);
    }

    /** Debug: raw shading — every texture off except the live HUD on the screen. */
    setTexturesEnabled(enabled: boolean) {
        this.textures.enabled = enabled;
        setTexturesEnabled(this.container, enabled, [this.hud.texture]);
        this.screen.setOverlay(enabled ? this.screenOverlayMap : null);
        if (enabled) {
            this.applyPosterMap();
        } else {
            this.poster.setMap(null);
            this.poster.setNormalMap(null);
            this.poster.setRoughnessMap(null);
        }
    }

    /** Debug: swap the whole accent (HUD, lights, LEDs, globe, glow strips). */
    setAccent(name: AccentName) {
        const from = new THREE.Color(PALETTE.green);
        setAccent(name);
        const to = new THREE.Color(PALETTE.green);
        this.accent.pink = name === "pink";
        this.greenLight.color = PALETTE.green;
        this._torchLive.copy(to);
        this.greenFill.groundColor.set(PALETTE.greenShade);
        this.hud.syncAccent();
        // Materials built from the old accent (glow strips, LEDs, globe lines).
        this.experience.scene.traverse((obj) => {
            const material = (obj as { material?: THREE.Material | THREE.Material[] }).material;
            if (!material) return;
            for (const m of Array.isArray(material) ? material : [material]) {
                const tinted = m as THREE.Material & { color?: THREE.Color; emissive?: THREE.Color };
                if (tinted.color?.equals(from)) tinted.color.copy(to);
                if (tinted.emissive?.equals(from)) tinted.emissive.copy(to);
            }
        });
    }

    applyPosterMap() {
        if (!this.textures.enabled) return;
        if (this.posterMap) this.poster.setMap(this.posterMap);
        if (this.posterNormalMap) this.poster.setNormalMap(this.posterNormalMap);
        this.poster.setNormalEnabled(this.posterNormal.enabled);
        if (this.posterRoughnessMap) {
            this.poster.setRoughnessMap(this.posterRoughnessMap);
        }
    }

    spawnPoster() {
        this.poster = createPoster(this.posterParams);
        this.container.add(this.poster.mesh);
        this.poster.fitHeight(this.posterViewHeight);
        this.applyPosterMap();
    }

    powerOn() {
        if (this.screenPowerTarget !== 1) this.sound.play({ type: "screen-on" });
        this.screenPowerTarget = 1;
        this.postFx.kick(0.8);
        this.cameraRig.startle(0.6);
        this.hud.setPowered(true);
        if (!this.hud.showsGlobe) return;
        this.globe.setPowered(true);
        this.globeShown = true;
        // Boost once the sphere has started materializing.
        window.setTimeout(() => this.globe.triggerBoost(), 550);
    }

    powerOff() {
        window.clearTimeout(this.powerOnTimer);
        window.clearTimeout(this.flyTimer);
        this.flyTimer = 0;
        this.screenPowerTarget = 0;
        this.screenPower = 0;
        this.hud.setPowered(false);
        this.globe.setPowered(false);
        this.globeShown = false;
    }

    resetPunch() {
        this.punch = null;
        this.punchX = 0;
        this.punchY = 0;
        this.punchZ = 0;
        this.punchRoll = 0;
    }

    resize() {
        const { width, height } = this.experience.sizes;
        const camera = this.experience.camera.instance;
        const aspect = width / height;
        const visibleHeight =
            Math.max(SCREEN_HEIGHT, SCREEN_WIDTH / aspect) / SCREEN_FILL;
        this.cameraDistance =
            visibleHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
        this.posterViewHeight = visibleHeight;
        this.poster.fitHeight(visibleHeight);
    }

    update() {
        this.game.update();
        if (!this.ready) return;

        const time = this.experience.time.elapsed / 1000;
        const dt = this.experience.time.delta / 1000;

        this.hud.setRhythmSongTime(this.game.songTime());
        this.hud.setMusicLevel(this.game.audio.bassLevel);
        this.hud.update(dt);
        if (this.hud.showsGlobe !== this.globeShown) {
            this.globeShown = this.hud.showsGlobe;
            this.globe.setPowered(this.globeShown);
        }
        this.globe.update(time, dt);
        this.poster.update(time, dt);

        this.updateFlashlights(time);
        this.updateScreenPower(dt);
        // Post glitch rides the HUD tear while the traces fuse (drop).
        const merge = this.hud.mergeGlitch;
        this.postFx.setGlitchLevel(merge);
        if (merge > 0.05 && this.lastMergeGlitch <= 0.05) this.sound.play({ type: "merge-glitch" });
        this.lastMergeGlitch = merge;
        this.sound.updateBeds({
            screenPower: this.screenPower,
            flicker: this.lastFlicker,
            musicPlaying: this.game.musicPlaying,
        });
        this.environment.update(time, dt, {
            screenPower: this.screenPower,
            flicker: this.lastFlicker,
            signalStage: this.hud.signalsFound,
        });
        this.updatePunch(dt);
        this.updateCamera(time, dt);
    }

    /** Each torch replays its fixed loop (same path every `period`), plus a nervous hand. */
    updateFlashlights(time: number) {
        const { moving, period, spread, z, tremor } = this.flashlightParams;
        const halfW = SCREEN_WIDTH / 2;
        const halfH = SCREEN_HEIGHT / 2;
        const u = moving ? (time / Math.max(0.5, period)) % 1 : 0;
        const shake = moving ? tremor : 0;

        this.flashlights.forEach((light, i) => {
            const { path, size, phase } = FLASHLIGHT_SEEDS[i];
            const [px, py] = path(u);
            // Scared hand: small search wobble around the aim + fast jitter.
            const shakeX =
                Math.sin(time * 1.9 + phase) * 0.9 +
                Math.sin(time * 7.3 + i * 3.1) * 0.6 +
                Math.sin(time * 17.7 + i) * 0.3;
            const shakeY =
                Math.cos(time * 1.6 + phase * 1.3) * 0.7 +
                Math.sin(time * 8.9 + i * 1.3) * 0.6 +
                Math.sin(time * 15.1 + i * 2) * 0.3;
            light.position.set(
                px * spread * halfW + shakeX * shake,
                py * spread * halfH + shakeY * shake,
                z * size,
            );
        });
    }

    /** Start the torch switch-on sequence (key L). Once only. */
    switchOnTorches() {
        if (Number.isFinite(this.torchesReadyAt)) return;
        this.torchesReadyAt = this.experience.time.elapsed / 1000;
    }

    /**
     * Torch `i` switch state (0..1): off until its turn, then a short bad-contact
     * stutter and on for good. Fires its click sound when it first lights.
     */
    private torchSwitch(i: number, now: number) {
        const { switchOnDelay, switchOnStagger } = this.flashlightParams;
        const t = now - this.torchesReadyAt - switchOnDelay - i * switchOnStagger;
        if (t < 0) return 0;
        if (!this.torchSwitched[i]) {
            this.torchSwitched[i] = true;
            const x = this.flashlights[i].position.x / (SCREEN_WIDTH / 2);
            this.sound.play({ type: "lamp-on", index: i, pan: Math.max(-1, Math.min(1, x)) });
        }
        // ~0.25 s stutter: on / off / dim / on, like a loose battery contact.
        if (t < 0.06) return 1;
        if (t < 0.11) return 0.05;
        if (t < 0.17) return 0.6;
        if (t < 0.22) return 0.1;
        return 1;
    }

    updateScreenPower(dt: number) {
        this.screenPower +=
            (this.screenPowerTarget - this.screenPower) * Math.min(1, dt * 3);
        // Neon-tube style flicker while the screen warms up.
        const warming = this.screenPowerTarget === 1 && this.screenPower < 0.97;
        const flicker = warming && Math.random() < 0.25 ? 0.3 : 1;
        this.lastFlicker = flicker;

        const { ambient, room, key, screenGlow } = this.lightingParams;
        // Kill room fill as the HUD takes over — wall should mostly catch green glow.
        const fill = 1 - this.screenPower;
        this.ambientLight.intensity = ambient * (0.35 + 0.65 * fill);
        this.topLight.intensity = key * fill;
        const { share, variation, idlePower, idleColor } = this.flashlightParams;
        // Torches are on from the start (people exploring before the screen wakes):
        // `idlePower` of their level + a neutral beam, ramping to full green with the screen.
        // Neon flicker only hits the screen-driven part — the hand-held beams stay steady.
        const level = idlePower + (1 - idlePower) * this.screenPower * flicker;
        const torch = screenGlow * share * level;
        this._torchIdle.set(idleColor);
        const t = (this.experience.time.elapsed / 1000) * 0.45;
        const now = this.experience.time.elapsed / 1000;
        this.flashlights.forEach((light, i) => {
            const { power, phase } = FLASHLIGHT_SEEDS[i];
            const switchOn = this.torchSwitch(i, now);
            // Slow uneven breathing in [-1, 1] — batteries / hand angle, never periodic-looking.
            const drift =
                0.55 * Math.sin(t * 0.37 + phase * 3.1) +
                0.3 * Math.sin(t * 0.91 + phase * 1.3) +
                0.15 * Math.sin(t * 2.3 + phase * 5.7);
            light.intensity = torch * power * Math.max(0, 1 + drift * variation) * switchOn;
            light.color.lerpColors(this._torchIdle, this._torchLive, this.screenPower);
        });
        this.roomLight.intensity = room * fill;
        this.syncCustomLights();
    }

    /** Drive poster + HUD glass shaders with the bunker lights. */
    syncCustomLights() {
        const camera = this.experience.camera.instance;
        camera.updateMatrixWorld();
        const view = camera.matrixWorldInverse;

        // PointLight intensities are tuned for MeshStandard — scale down for custom shaders.
        this._ambientColor
            .copy(this.ambientLight.color)
            .multiplyScalar(this.ambientLight.intensity * 0.85);

        const debug = this.debugLight.enabled ? this.debugLight.intensity : 0;
        this.debugFill.intensity = debug;
        this.debugKey.intensity = debug;
        // Off = out of the light list entirely (an intensity-0 light still costs per pixel).
        this.debugFill.visible = debug > 0;
        this.debugKey.visible = debug > 0;
        const { enabled, intensity, ambientShare, color, dirX, dirY, dirZ } = this.greenLight;
        const green = enabled ? intensity : 0;
        this.greenFill.color.set(color);
        this.greenKey.color.set(color);
        // ×2 so 0.5 keeps both halves at `intensity`, like before the split.
        this.greenFill.intensity = green * ambientShare * 2;
        this.greenKey.intensity = green * (1 - ambientShare) * 2;
        this.greenKey.position.set(dirX, dirY, dirZ);
        // Poster is a custom shader — fold the debug flood + green base into its ambient.
        this._ambientColor.addScalar(debug * 0.6);
        this._greenAmbient.copy(this.greenFill.color).multiplyScalar(this.greenFill.intensity * 0.6);
        this._ambientColor.add(this._greenAmbient);

        this._keyColor
            .copy(this.topLight.color)
            .multiplyScalar(this.topLight.intensity * 0.9);
        this._lightDir
            .copy(this.topLight.position)
            .normalize()
            .transformDirection(view);

        this._roomColor
            .copy(this.roomLight.color)
            .multiplyScalar(this.roomLight.intensity * 0.055);
        this.roomLight
            .getWorldPosition(this._roomViewPos)
            .applyMatrix4(view);

        this._glowColor.copy(this.screenGlow.color);
        this.screenGlow
            .getWorldPosition(this._glowViewPos)
            .applyMatrix4(view);

        const glowIntensity = this.screenGlow.intensity * 0.045;

        if (!this.poster.gone) {
            this.poster.setSceneLights({
                ambient: this._ambientColor,
                keyColor: this._keyColor,
                keyDir: this._lightDir,
                roomColor: this._roomColor,
                roomPos: this._roomViewPos,
                roomDistance: this.roomLight.distance,
                roomDecay: this.roomLight.decay,
                glowColor: this._glowColor,
                glowPos: this._glowViewPos,
                glowIntensity,
                glowDistance: this.screenGlow.distance,
                glowDecay: this.screenGlow.decay,
            });
        }

    }

    updatePunch(dt: number) {
        if (!this.punch) return;

        const params = this.posterParams;
        this.punch.elapsed += dt;
        const e = this.punch.elapsed;
        const hitDur = Math.max(0.02, params.windCamHit);
        const recoverDur = Math.max(0.1, params.windCamRecover);
        const peakX = 0.38 * params.windCamX;
        const peakY = -0.22 * params.windCamY;
        const peakZ = 0.18 * params.windCamZ;
        const peakRoll = -0.05 * params.windCamRoll;

        let base: number;
        let turbulence: number;
        let done = false;
        if (e <= hitDur) {
            // Impact: ease-out-back, slight overshoot past the peak.
            const u = e / hitDur;
            const c = 1.6;
            const t1 = u - 1;
            base = 1 + (c + 1) * t1 * t1 * t1 + c * t1 * t1;
            turbulence = u;
        } else {
            // Dazed recenter: damped swing that slightly crosses center, then settles.
            const u = Math.min(1, (e - hitDur) / recoverDur);
            base = Math.exp(-3.2 * u) * Math.cos(u * Math.PI * 1.35) * (1 - u);
            turbulence = Math.exp(-4 * u);
            done = u >= 1;
        }

        if (done) {
            this.resetPunch();
            return;
        }

        // Handheld-like buffeting from the gust, layered incommensurate sines.
        const shakeX = Math.sin(e * 31) * 0.6 + Math.sin(e * 17.3 + 1.1) * 0.4;
        const shakeY =
            Math.sin(e * 27.7 + 0.4) * 0.6 + Math.sin(e * 13.1 + 2.3) * 0.4;
        const shakeZ =
            Math.sin(e * 19.4 + 1.5) * 0.5 + Math.sin(e * 29.1 + 0.2) * 0.35;
        const shakeR = Math.sin(e * 23.9 + 0.7);
        this.punchX =
            peakX * base + shakeX * 0.016 * params.windCamX * turbulence;
        this.punchY =
            peakY * base + shakeY * 0.01 * params.windCamY * turbulence;
        this.punchZ =
            peakZ * base + shakeZ * 0.008 * params.windCamZ * turbulence;
        this.punchRoll = peakRoll * base + shakeR * 0.004 * turbulence;
    }

    /** Base framing + explorer rig (drift / breath / stress / handheld) + poster punch. */
    updateCamera(time: number, dt: number) {
        const camera = this.experience.camera.instance;
        // The drop's tear glitch keeps the watcher on edge.
        this.cameraRig.startle(this.hud.mergeGlitch * 0.8);
        const o = this.cameraRig.update(time, dt);
        camera.position.set(
            this.punchX + o.x,
            this.punchY + o.y,
            SCREEN_Z + SCREEN_SURFACE_Z + this.cameraDistance + this.punchZ + o.z,
        );
        camera.lookAt(this.punchX + o.lookX, this.punchY + o.lookY, SCREEN_Z);
        camera.rotateZ(this.punchRoll + o.roll);
    }
}

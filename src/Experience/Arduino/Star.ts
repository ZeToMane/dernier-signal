import EventEmitter from "../Utils/EventEmitter";
import type Arduino from "./Arduino";

/**
 * La lumière ambiante (écran, pièce) et la pose du doigt font varier les niveaux :
 *   découverte ≈ 870–970, cachée ≈ 600–780 selon les fois.
 * Des seuils fixes tombent donc parfois pile dans le bruit. On compare plutôt
 * la valeur lissée aux niveaux récents :
 *   cachée     = chute sous le niveau « main ouverte »
 *   découverte = remontée au-dessus du point le plus sombre
 * L'écart exigé est une part (TRAVEL_RATIO) de l'écart ouvert ↔ caché, avec un minimum :
 * avec un capteur bien couvert (≈ 200 vs 870), un doigt qui bouge un peu ne suffit plus.
 * Et un maximum (TRAVEL_MAX) : un vieux pic de lumière (≈ 1000) mémorisé pendant qu'on cache
 * ne doit pas exiger une remontée que la lumière actuelle (≈ 450) n'atteindra jamais.
 * Pièce sombre (≈ 26 ouverte / 12 cachée avec la 10 kΩ) : l'écart n'atteint jamais ces minimums.
 * Le seuil devient alors une part du niveau lui-même (on garde le plus facile des deux) :
 * en pièce claire rien ne change, dans le noir on arme sous ~65 % du niveau ouvert.
 * Hit = on DÉCOUVRE (main qui s'ouvre), arme = on CACHE.
 */
const COVER_DROP = 70;
const UNCOVER_RISE = 50;
const TRAVEL_RATIO = 0.5;
const TRAVEL_MAX = 150;
/** Pièce sombre : cachée = chute de cette part du niveau ouvert. */
const COVER_LEVEL_RATIO = 0.35;
/** Pièce sombre : découverte = remontée de cette part au-dessus du creux. */
const UNCOVER_LEVEL_RATIO = 0.4;
/** Plancher des seuils (brut) : le scintillement de l'écran ne doit pas suffire. */
const MIN_STEP = 8;
/** Après un hit, « cachée » est ignoré le temps que la main finisse de s'ouvrir (rebonds). */
const HIT_LOCKOUT_MS = 180;
/** Moyenne glissante (×15 ms côté Arduino) : lisse le scintillement écran / LED. */
const SMOOTH_SAMPLES = 4;
/**
 * Part de l'écart parcourue à chaque mesure quand un niveau suit la lumière qui change
 * (~1,5 s à 15 ms) : lent devant un geste, rapide devant l'écran qui varie.
 */
const LEVEL_FOLLOW = 0.01;
const DEBUG_EVERY_MS = 500;

/**
 * L'étoile : cacher = arme ; découvrir = 1 hit pad.
 * Events: "change" (0–1), "hit", "cover" / "uncover".
 */
export default class Star extends EventEmitter {
    raw = 0;
    /** Moyenne des SMOOTH_SAMPLES dernières mesures : c'est elle qui décide. */
    smoothed = 0;
    min = 0;
    max = 1023;
    value = 0;
    /** True = doigt / objet qui cache le capteur. */
    covered = false;
    count = 0;

    /** Chute minimale (brut) sous le niveau ouvert → cachée (arme). */
    coverDrop = COVER_DROP;
    /** Remontée minimale (brut) au-dessus du point le plus sombre → découverte (hit si armée). */
    uncoverRise = UNCOVER_RISE;
    /** Part de l'écart ouvert ↔ caché à parcourir dans un sens comme dans l'autre. */
    travelRatio = TRAVEL_RATIO;

    /** Niveau « main ouverte » (pic récent, suit lentement la lumière ambiante). */
    private openLevel: number | null = null;
    /** Niveau « main cachée » (creux récent, suit lentement). Null avant le premier geste. */
    private darkLevel: number | null = null;
    private lastHitAt = -Infinity;
    /** Armée = cachée depuis le dernier hit : il faut fermer la main avant de rejouer. */
    private armed = false;
    private lastDebugAt = 0;
    private readonly recent: number[] = [];

    constructor(arduino: Arduino) {
        super();
        arduino.on("light", (raw: number) => this.onLight(raw));
    }

    /** @deprecated kept for old calibrage UI; thresholds drive gameplay now. */
    calibrate(edge: "min" | "max") {
        this[edge] = this.raw;
    }

    /** Alias debug HUD (cachée = covered). */
    get uncovered() {
        return !this.covered;
    }

    private onLight(raw: number) {
        this.raw = raw;
        this.recent.push(raw);
        if (this.recent.length > SMOOTH_SAMPLES) this.recent.shift();
        const v = this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
        this.smoothed = v;

        const range = this.max - this.min || 1;
        this.value = Math.min(1, Math.max(0, (raw - this.min) / range));
        this.trigger("change", [this.value]);

        if (this.openLevel === null) this.openLevel = v;

        if (!this.covered) {
            // Pic : monte tout de suite, redescend lentement (l'écran s'assombrit).
            this.openLevel =
                v > this.openLevel ? v : this.openLevel + (v - this.openLevel) * LEVEL_FOLLOW;

            const locked = performance.now() - this.lastHitAt < HIT_LOCKOUT_MS;
            if (!locked && v < this.openLevel - this.coverThreshold()) {
                this.covered = true;
                this.armed = true;
                this.darkLevel = v;
                this.trigger("cover");
                this.logEvent("CACHÉE (armée)");
            }
        } else {
            // Creux : descend tout de suite, remonte lentement.
            const dark = this.darkLevel ?? v;
            this.darkLevel = v < dark ? v : dark + (v - dark) * LEVEL_FOLLOW;

            if (v > this.darkLevel + this.uncoverThreshold()) {
                this.covered = false;
                this.openLevel = v;
                this.trigger("uncover");
                if (this.armed) {
                    this.armed = false;
                    this.count++;
                    this.lastHitAt = performance.now();
                    this.trigger("hit");
                    this.logEvent(`HIT #${this.count} (découverte / main ouverte)`);
                }
            }
        }

        const now = performance.now();
        if (now - this.lastDebugAt >= DEBUG_EVERY_MS) {
            this.lastDebugAt = now;
            this.logStatus();
        }
    }

    /** Écart ouvert ↔ caché connu (0 avant le premier geste). */
    private contrast() {
        if (this.openLevel === null || this.darkLevel === null) return 0;
        return Math.max(0, this.openLevel - this.darkLevel);
    }

    private coverThreshold() {
        const travel = Math.min(TRAVEL_MAX, Math.max(this.coverDrop, this.contrast() * this.travelRatio));
        const dim = (this.openLevel ?? 0) * COVER_LEVEL_RATIO;
        return Math.max(MIN_STEP, Math.min(travel, dim));
    }

    private uncoverThreshold() {
        const travel = Math.min(TRAVEL_MAX, Math.max(this.uncoverRise, this.contrast() * this.travelRatio));
        const dim = (this.darkLevel ?? 0) * UNCOVER_LEVEL_RATIO;
        return Math.max(MIN_STEP, Math.min(travel, dim));
    }

    private logStatus() {
        const state = this.covered ? "CACHÉE" : "DÉCOUVERTE";
        const next = this.covered
            ? `hit si >${Math.round((this.darkLevel ?? 0) + this.uncoverThreshold())} (creux ${Math.round(this.darkLevel ?? 0)})`
            : `arme si <${Math.round((this.openLevel ?? 0) - this.coverThreshold())} (pic ${Math.round(this.openLevel ?? 0)})`;
        console.log(
            `[étoile] brut=${Math.round(this.raw)} lissé=${Math.round(this.smoothed)} | ${next} | ` +
                `${state} armée=${this.armed} hits=${this.count}`,
        );
    }

    private logEvent(label: string) {
        console.log(
            `%c[étoile] ${label}`,
            "color:#2fe0a0;font-weight:bold",
            `| brut=${Math.round(this.raw)} lissé=${Math.round(this.smoothed)}`,
        );
    }
}

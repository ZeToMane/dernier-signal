import * as THREE from "three";
import Scene from "../../Scene";
import { createDebugPanel } from "./debug/createDebugPanel";
import { Hud, loadHudFonts } from "./hud/Hud";
import {
    designToScreen,
    designToScreenLength,
    GLOBE,
    PALETTE,
    SCREEN_HEIGHT,
    SCREEN_WIDTH,
} from "./layout";
import { DEFAULT_CAMERA_MOTION } from "./objects/cameraMotion";
import { createGlobe } from "./objects/createGlobe";
import {
    createPoster,
    DEFAULT_POSTER_PARAMS,
    type Poster,
} from "./objects/createPoster";
import { createScreen, SCREEN_SURFACE_Z } from "./objects/createScreen";
import { createWall } from "./objects/createWall";

const SCREEN_Z = 0.06;
/** Share of the viewport the screen should fill, taken from the mockup. */
const SCREEN_FILL = 0.82;
const GLOW_INTENSITY = 18;
/** Neutral fill keeping the wall readable while the screen is off; fades out as the green glow takes over. */
const ROOM_LIGHT_INTENSITY = 40;

type Globe = ReturnType<typeof createGlobe>;

export default class LastRave extends Scene {
    ready = false;

    hud!: Hud;
    globe!: Globe;
    poster!: Poster;
    screenGlow!: THREE.PointLight;
    roomLight!: THREE.PointLight;

    cameraMotion = { ...DEFAULT_CAMERA_MOTION };
    posterParams = { ...DEFAULT_POSTER_PARAMS };
    posterMap: THREE.Texture | null = null;
    posterViewHeight = 1;
    cameraDistance = 0;

    screenPower = 0;
    screenPowerTarget = 0;
    powerOnTimer = 0;
    globeShown = false;

    // Wind punch: snap right+down, then slow dazed ease back to center.
    punch: { elapsed: number } | null = null;
    punchX = 0;
    punchY = 0;
    punchZ = 0;
    punchRoll = 0;

    constructor() {
        super();

        loadHudFonts().then(() => this.init());
    }

    init() {
        this.setHud();
        this.setObjects();
        this.setLights();
        this.setPosterTexture();
        this.setDebug();

        this.experience.sizes.on("resize", () => this.resize());
        this.resize();

        this.ready = true;
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
        const screen = createScreen(this.hud.texture);
        screen.position.z = SCREEN_Z;

        this.globe = createGlobe();
        const globePosition = designToScreen(GLOBE.x, GLOBE.y);
        this.globe.group.position.set(
            globePosition.x,
            globePosition.y,
            SCREEN_SURFACE_Z + 0.01,
        );
        this.globe.setScale(designToScreenLength(GLOBE.radius));
        screen.add(this.globe.group);

        this.poster = createPoster(this.posterParams);

        this.container.add(createWall(), screen, this.poster.mesh);
    }

    setLights() {
        this.screenGlow = new THREE.PointLight(PALETTE.green, 0, 10, 2);
        this.screenGlow.position.set(0, 0, 1.2);

        this.roomLight = new THREE.PointLight(
            "#9fb8ae",
            ROOM_LIGHT_INTENSITY,
            10,
            2,
        );
        this.roomLight.position.set(0, 0, 1.2);

        const topLight = new THREE.DirectionalLight("#9fb8ae", 0.8);
        topLight.position.set(0.5, 3, 2);

        this.container.add(
            this.screenGlow,
            this.roomLight,
            topLight,
            new THREE.AmbientLight("#4a6a5f", 0.6),
        );
    }

    setPosterTexture() {
        const resources = this.experience.resources;
        const apply = () => {
            const texture = resources.items.posterTexture as THREE.Texture;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = this.maxAnisotropy;
            this.posterMap = texture;
            this.applyPosterMap();
        };

        if (resources.isReady) apply();
        else resources.on("ready", apply);
    }

    setDebug() {
        createDebugPanel(this.hud, this.cameraMotion, this.posterParams, {
            onGlobeBoost: () => this.globe.triggerBoost(),
            onPosterFly: () => {
                if (this.poster.gone || this.poster.flying) return;
                this.poster.fly();
                this.punch = { elapsed: 0 };
                // Screen boots 200ms after the poster starts peeling off.
                this.powerOnTimer = window.setTimeout(
                    () => this.powerOn(),
                    Math.max(0.02, this.posterParams.windCamHit) * 1000 + 200,
                );
            },
            onPosterReset: () => {
                if (this.poster.gone) this.spawnPoster();
                else this.poster.reset();
                this.resetPunch();
                this.powerOff();
            },
            onSignalStage: (count) => {
                if (count > 0 && !this.hud.isPowered) this.powerOn();
                this.hud.setSignalStage(count);
            },
        });
    }

    applyPosterMap() {
        if (this.posterMap) this.poster.setMap(this.posterMap);
    }

    spawnPoster() {
        this.poster = createPoster(this.posterParams);
        this.container.add(this.poster.mesh);
        this.poster.fitHeight(this.posterViewHeight);
        this.applyPosterMap();
    }

    powerOn() {
        this.screenPowerTarget = 1;
        this.hud.setPowered(true);
        if (!this.hud.showsGlobe) return;
        this.globe.setPowered(true);
        this.globeShown = true;
        // Boost once the sphere has started materializing.
        window.setTimeout(() => this.globe.triggerBoost(), 550);
    }

    powerOff() {
        window.clearTimeout(this.powerOnTimer);
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
        if (!this.ready) return;

        const time = this.experience.time.elapsed / 1000;
        const dt = this.experience.time.delta / 1000;

        this.hud.update(dt);
        if (this.hud.showsGlobe !== this.globeShown) {
            this.globeShown = this.hud.showsGlobe;
            this.globe.setPowered(this.globeShown);
        }
        this.globe.update(time, dt);
        this.poster.update(time, dt);

        this.updateScreenPower(dt);
        this.updatePunch(dt);
        this.updateCamera();
    }

    updateScreenPower(dt: number) {
        this.screenPower +=
            (this.screenPowerTarget - this.screenPower) * Math.min(1, dt * 3);
        // Neon-tube style flicker while the screen warms up.
        const warming = this.screenPowerTarget === 1 && this.screenPower < 0.97;
        const flicker = warming && Math.random() < 0.25 ? 0.3 : 1;
        this.screenGlow.intensity = GLOW_INTENSITY * this.screenPower * flicker;
        this.roomLight.intensity = ROOM_LIGHT_INTENSITY * (1 - this.screenPower);
        this.poster.setGlow(0.12 * this.screenPower * flicker);
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

    updateCamera() {
        const camera = this.experience.camera.instance;
        camera.position.set(
            this.punchX,
            this.punchY,
            SCREEN_Z + SCREEN_SURFACE_Z + this.cameraDistance + this.punchZ,
        );
        camera.lookAt(this.punchX, this.punchY, SCREEN_Z);
        camera.rotateZ(this.punchRoll);
    }
}

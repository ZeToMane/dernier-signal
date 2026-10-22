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
} from "./layout";
import { DEFAULT_CAMERA_MOTION } from "./objects/cameraMotion";
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
/** Network reactivates once all 3 objects are found and accuracy stays ≥ FINAL_ACCURACY for FINAL_HOLD s. */
const FINAL_ACCURACY = 60;
const FINAL_HOLD = 3;

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
    screenGlow!: THREE.PointLight;
    roomLight!: THREE.PointLight;
    topLight!: THREE.DirectionalLight;
    ambientLight!: THREE.AmbientLight;
    lastFlicker = 1;

    cameraMotion = { ...DEFAULT_CAMERA_MOTION };
    posterParams = { ...DEFAULT_POSTER_PARAMS };
    lightingParams = { ...DEFAULT_LIGHTING_PARAMS };
    wallLightParams = { ...DEFAULT_WALL_LIGHT_PARAMS };
    posterMap: THREE.Texture | null = null;
    posterNormalMap: THREE.Texture | null = null;
    posterRoughnessMap: THREE.Texture | null = null;
    posterNormal = { enabled: true };
    screenRoughness = { enabled: true };
    posterViewHeight = 1;
    cameraDistance = 0;

    screenPower = 0;
    screenPowerTarget = 0;
    powerOnTimer = 0;
    globeShown = false;
    accuracyHold = 0;

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

    constructor() {
        super();

        loadHudFonts().then(() => this.init());
    }

    init() {
        this.setHud();
        this.setObjects();
        this.setLights();
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

        // Wall + steel receive the green glow; HUD glass stays on layer 0 only.
        this.wall.layers.enable(GLOW_LAYER);
        this.environment.group.traverse((obj) => obj.layers.enable(GLOW_LAYER));
        this.screen.group.traverse((obj) => obj.layers.set(0));
    }

    setLights() {
        // Green wash on concrete / steel — layer-masked so it never hits the HUD plane.
        this.screenGlow = new THREE.PointLight(PALETTE.green, 0, 7, 1.4);
        this.screenGlow.position.set(0, 0.05, 0.55);
        this.screenGlow.layers.set(GLOW_LAYER);

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

        this.experience.camera.instance.layers.enable(GLOW_LAYER);

        this.container.add(
            this.screenGlow,
            this.roomLight,
            this.topLight,
            this.ambientLight,
        );
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

            const screenOverlay = resources.items
                .screenOverlay as THREE.Texture;
            screenOverlay.colorSpace = THREE.SRGBColorSpace;
            screenOverlay.anisotropy = this.maxAnisotropy;
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

    setDebug() {
        createDebugPanel(
            this.hud,
            this.cameraMotion,
            this.posterParams,
            this.lightingParams,
            this.wallLightParams,
            {
                onWallLightChange: () =>
                    applyWallLightParams(this.wall, this.wallLightParams),
                onGlobeBoost: () => this.globe.triggerBoost(),
                onPosterFly: () => {
                    if (this.poster.gone || this.poster.flying) return;
                    this.poster.fly();
                    this.punch = { elapsed: 0 };
                    // Screen boots 200ms after the poster starts peeling off.
                    this.powerOnTimer = window.setTimeout(
                        () => this.powerOn(),
                        Math.max(0.02, this.posterParams.windCamHit) * 1000 +
                            200,
                    );
                },
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
            },
            this.posterNormal,
            this.screenRoughness,
        );
    }

    /** 0 = intro, 1..3 = objects found, 4 = network reactivated (final). */
    setSignalStage(count: number) {
        if (count > 0 && !this.hud.isPowered) this.powerOn();
        this.hud.setSignalStage(count);
        this.game.setActiveLanes(Math.min(3, count));
        this.accuracyHold = 0;
        // Music starts on first signal object, not on the base "fête" screen.
        if (count >= 1) this.game.startLoop();
        if (count >= 4) this.game.playDrop();
    }

    updateFinalTrigger(dt: number) {
        const accuracy = this.game.accuracy;
        const armed = this.hud.signalsFound === 3;

        if (armed && accuracy >= FINAL_ACCURACY) this.accuracyHold += dt;
        else this.accuracyHold = 0;

        this.hud.setRhythmAccuracy(
            accuracy,
            armed ? FINAL_ACCURACY : 0,
            this.accuracyHold / FINAL_HOLD,
        );

        if (this.accuracyHold >= FINAL_HOLD) this.setSignalStage(4);
    }

    applyPosterMap() {
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
        this.game.update();
        if (!this.ready) return;

        const time = this.experience.time.elapsed / 1000;
        const dt = this.experience.time.delta / 1000;

        this.hud.setRhythmSongTime(this.game.songTime());
        this.updateFinalTrigger(dt);
        this.hud.update(dt);
        if (this.hud.showsGlobe !== this.globeShown) {
            this.globeShown = this.hud.showsGlobe;
            this.globe.setPowered(this.globeShown);
        }
        this.globe.update(time, dt);
        this.poster.update(time, dt);

        this.updateScreenPower(dt);
        this.environment.update(time, dt, {
            screenPower: this.screenPower,
            flicker: this.lastFlicker,
            signalStage: this.hud.signalsFound,
        });
        this.updatePunch(dt);
        this.updateCamera();
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
        this.screenGlow.intensity = screenGlow * this.screenPower * flicker;
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

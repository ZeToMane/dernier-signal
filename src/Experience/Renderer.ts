import * as THREE from "three";
import Experience from "./Experience";

export default class Renderer {
    experience: Experience;
    canvas: HTMLCanvasElement;
    sizes: Experience["sizes"];
    scene: THREE.Scene;
    camera: Experience["camera"];
    instance!: THREE.WebGLRenderer;
    /** Optional post chain owned by the active scene — renders instead of the plain pass. */
    postProcess: {
        render(dt: number): void;
        setSize(width: number, height: number): void;
    } | null = null;

    constructor() {
        this.experience = Experience.instance;
        this.canvas = this.experience.canvas;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.camera = this.experience.camera;

        this.setInstance();
    }

    setInstance() {
        this.instance = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
        });
        this.instance.setClearColor("#000000", 0);
        this.instance.outputColorSpace = THREE.SRGBColorSpace;
        this.instance.toneMapping = THREE.ACESFilmicToneMapping;
        this.instance.setSize(this.sizes.width, this.sizes.height);
        this.instance.setPixelRatio(this.sizes.pixelRatio);
    }

    resize() {
        this.instance.setSize(this.sizes.width, this.sizes.height);
        this.instance.setPixelRatio(this.sizes.pixelRatio);
        this.postProcess?.setSize(this.sizes.width, this.sizes.height);
    }

    async update() {
        if (this.postProcess) {
            this.postProcess.render(this.experience.time.delta / 1000);
            return;
        }
        await this.instance.render(this.scene, this.camera.instance);
    }
}

import * as THREE from "three/webgpu";
import Sizes from "./Utils/Sizes";
import Time from "./Utils/Time";
import Camera from "./Camera";
import Renderer from "./Renderer";
import World from "./World";
import Resources from "./Utils/Resources";
import sources from "./sources";

export default class Experience {
    static instance: Experience;

    canvas!: HTMLCanvasElement;
    sizes!: Sizes;
    time!: Time;
    scene!: THREE.Scene;
    resources!: Resources;
    camera!: Camera;
    renderer!: Renderer;
    world!: World;

    constructor(canvas: HTMLCanvasElement) {
        if (Experience.instance) return Experience.instance;
        Experience.instance = this;

        this.canvas = canvas;
        this.sizes = new Sizes();
        this.time = new Time();
        this.scene = new THREE.Scene();
        this.resources = new Resources(sources);

        this.camera = new Camera();
        this.renderer = new Renderer();
        this.world = new World();

        this.sizes.on("resize", () => this.resize());
        this.time.on("tick", () => this.update());
    }

    resize() {
        this.camera.resize();
        this.renderer.resize();
    }

    update() {
        this.world.update();
    }
}

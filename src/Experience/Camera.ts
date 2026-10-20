import * as THREE from "three/webgpu";
import Experience from "./Experience";

export default class Camera {
    experience: Experience;
    sizes: Experience["sizes"];
    scene: THREE.Scene;
    canvas: HTMLCanvasElement;
    instance!: THREE.PerspectiveCamera;

    constructor() {
        this.experience = Experience.instance;
        this.sizes = this.experience.sizes;
        this.scene = this.experience.scene;
        this.canvas = this.experience.canvas;

        this.setInstance();
    }

    setInstance() {
        this.instance = new THREE.PerspectiveCamera(
            35,
            this.sizes.width / this.sizes.height,
            0.1,
            100,
        );
        this.instance.position.set(0, 0, 0.5);
        this.scene.add(this.instance);
    }

    resize() {
        this.instance.aspect = this.sizes.width / this.sizes.height;
        this.instance.updateProjectionMatrix();
    }
}

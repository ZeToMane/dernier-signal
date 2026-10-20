import * as THREE from "three";
import Scene from "../Scene";

export default class Demo extends Scene {
    cube!: THREE.Mesh;

    constructor() {
        // This calls the Scene class constructor, which automatically
        // initializes this.experience and this.container for you.
        super();

        this.setObjects();
    }

    setObjects() {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        this.cube = new THREE.Mesh(geometry, material);

        // IMPORTANT: Add objects to this.container, NOT directly to this.experience.scene
        this.container.add(this.cube);
    }

    // World.ts calls this function on every frame if this is the active scene
    update() {
        if (this.cube) {
            this.cube.rotation.y += 0.01;
            this.cube.rotation.x += 0.01;
        }
    }
}

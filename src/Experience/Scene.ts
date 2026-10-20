import * as THREE from "three";
import Experience from "./Experience";

export default abstract class Scene {
    protected experience: Experience;
    public container: THREE.Group;

    constructor() {
        this.experience = Experience.instance;

        this.container = new THREE.Group();
    }

    abstract update(): void;
}

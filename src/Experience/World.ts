import * as THREE from "three";
import Experience from "./Experience";

// Importe tes futures scènes ici
// import MainMenu from "./MainMenu";
// import LevelOne from "./LevelOne";

export default class World {
    experience: Experience;
    scene: THREE.Scene;
    resources: Experience["resources"];

    // Dictionnaire pour stocker toutes les scènes préchargées
    scenes: Record<string, any> = {};
    // Référence vers la scène actuellement active
    currentScene: any = null;

    constructor() {
        this.experience = Experience.instance;
        this.scene = this.experience.scene;
        this.resources = this.experience.resources;

        const ambientLight = new THREE.AmbientLight(0xffffff, 3);
        this.scene.add(ambientLight);

        this.preloadScenes();
    }

    preloadScenes() {
        // Instanciation de toutes les scènes pour les garder en mémoire
        // this.scenes['menu'] = new MainMenu();
        // this.scenes['level1'] = new LevelOne();
        // Définir la scène de départ
        // this.switchScene('menu');
    }

    switchScene(sceneName: string) {
        // 1. Retirer la scène actuelle du graphe principal de THREE.js
        if (this.currentScene && this.currentScene.container) {
            this.scene.remove(this.currentScene.container);
        }

        // 2. Basculer sur la nouvelle scène
        this.currentScene = this.scenes[sceneName];

        // 3. Ajouter le conteneur de la nouvelle scène au graphe principal
        if (this.currentScene && this.currentScene.container) {
            this.scene.add(this.currentScene.container);
        } else {
            console.warn(
                `La scène "${sceneName}" n'existe pas ou n'a pas de conteneur.`,
            );
        }
    }

    update() {
        // Mettre à jour uniquement la scène active
        if (
            this.currentScene &&
            typeof this.currentScene.update === "function"
        ) {
            this.currentScene.update();
        }
    }
}

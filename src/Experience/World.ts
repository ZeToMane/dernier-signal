import * as THREE from "three";
import Experience from "./Experience";

//Scenes
import Demo from "./Scenes/Demo";
import LastRave from "./Scenes/LastRave/LastRave";

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

        this.preloadScenes();
    }

    preloadScenes() {
        // Instanciation de toutes les scènes pour les garder en mémoire
        this.scenes["demo"] = new Demo();
        this.scenes["lastRave"] = new LastRave();

        // Définir la scène de départ
        this.switchScene("lastRave");
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

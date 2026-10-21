# 🎛️ Dernier Signal

**Dernier Signal** is an interactive, web-based 3D rhythm game experience. Built with **Three.js** and **TypeScript**, it features a highly modular, class-based architecture designed to handle complex 3D environments and logic smoothly. The application is built to be ultimately controlled via a custom **Arduino** hardware interface.

This repository serves as the WebGL front-end, utilizing Vite for fast bundling and hot-module replacement, and strict TypeScript for robust code maintainability.

---

## 📑 Table of Contents

1. [Project Structure](#-project-structure)
2. [Installation & Setup](#-installation--setup)
3. [Core Architecture](#-core-architecture)
    - [The Experience Singleton](#the-experience-singleton)
    - [Renderer & Camera](#renderer--camera)
    - [World & Scene Management](#world--scene-management)
4. [Asset Pipeline](#-asset-pipeline)
5. [Global Utilities](#-global-utilities)
6. [Creating a New Scene (Tutorial)](#-creating-a-new-scene)

---

## 📂 Project Structure

The project relies on a structured architecture to cleanly separate rendering logic, scene management, global utilities, and game mechanics.

```text
DERNIER-SIGNAL/
├── public/
│   └── assets/            # Static 3D models (.glb), textures, etc.
├── src/
│   ├── Experience/
│   │   ├── Scenes/        # Individual playable levels and menus (e.g., Demo.ts)
│   │   ├── Utils/         # Global utilities (EventEmitter, Time, Sizes, Resources)
│   │   ├── Camera.ts      # Perspective camera configuration
│   │   ├── Experience.ts  # The central application singleton
│   │   ├── Renderer.ts    # WebGL rendering engine setup
│   │   ├── Scene.ts       # Abstract base class for all scenes
│   │   ├── sources.ts     # Asset manifest definitions
│   │   └── World.ts       # Scene lifecycle and environment manager
│   ├── main.ts            # Application entry point
│   └── style.css          # Global styling
├── package.json
└── vite.config.ts         # Vite bundler configuration
```

---

## 🚀 Installation & Setup

This project uses `pnpm` for fast and efficient dependency management.

1. **Install dependencies:**

    ```bash
    pnpm install
    ```

2. **Start the development server:**

    ```bash
    pnpm run dev
    ```

3. **Build for production:**
    ```bash
    pnpm run build
    ```

---

## 🏗️ Core Architecture

### The `Experience` Singleton

Located in `Experience.ts`, this is the heart of the application. It uses the **Singleton pattern** to ensure that only one instance of the game engine is ever running.

- **Centralized State:** It initializes and holds references to all core components: `Sizes`, `Time`, the global `THREE.Scene`, `Resources`, `Camera`, `Renderer`, and `World`.
- **Lifecycle Management:** It binds to the global `resize` and `tick` events. When the window resizes, `Experience` propagates this to the `Camera` and `Renderer`. Every frame (`tick`), it calls the `update()` methods on the `World` and `Renderer`.

### Renderer & Camera

- **`Renderer.ts`:** Manages the `THREE.WebGLRenderer`. It is configured with antialiasing for smooth edges and an alpha channel (transparent background). It automatically handles pixel ratio limits (clamped to 2) to maintain high performance across all devices.
- **`Camera.ts`:** Initializes a `THREE.PerspectiveCamera`. It handles its own aspect ratio recalculations and projection matrix updates whenever the viewport size changes.

### World & Scene Management

The `World.ts` class orchestrates the 3D environment and acts as the **Scene Manager**.

- **Global Environment:** It applies global settings, such as `THREE.AmbientLight`, that persist across the entire experience.
- **State Machine:** It maintains a dictionary (`Record<string, any>`) of instantiated scenes (like menus, levels, or demos) to keep them in memory, avoiding costly re-instantiations.
- **Safe Transitions:** The `switchScene()` method securely swaps scenes. It detaches the previous scene's objects from the WebGL rendering graph and attaches the new one, preventing visual overlap and memory leaks.
- **Delegated Updates:** During the frame loop, `World` ensures that _only_ the currently active scene runs its `update()` logic.

---

## 📦 Asset Pipeline

Managing 3D models and textures in Three.js can become messy. This project solves that by completely decoupling asset definitions from the scene logic.

### `sources.ts` (The Manifest)

This file acts as a simple array of all assets required for the game. To add a new asset, you just declare it here:

```typescript
export default [
    {
        name: "playerShip",
        type: "gltfModel",
        path: "/assets/ship-draco.glb", // Stored in the public folder
    },
] as Source[];
```

Supported types are `gltfModel` and `texture` (loaded with `THREE.TextureLoader`).

### `Resources.ts` (The Loader)

When the application starts, `Resources.ts` reads the `sources.ts` manifest and preloads everything.

- **Draco Compression:** It comes pre-configured with a `GLTFLoader` and `DRACOLoader` pointing to Google's decoding API. This means you can use highly compressed `.glb` files for fast loading times.
- **Event-Driven:** It tracks the loading progress. Once all files in the manifest are fully loaded and stored in the `this.items` dictionary, it fires a global `ready` event.

---

## 🧰 Global Utilities

Located in the `Utils/` folder, these helper classes power the background mechanics of the engine:

- **`EventEmitter.ts`:** A custom event dispatcher. Classes inherit from this to allow loosely coupled communication (using `on()` to listen and `trigger()` to dispatch).
- **`Sizes.ts`:** Listens to native window resizes, calculates the exact viewport dimensions and device pixel ratio, and broadcasts a `resize` event to the rest of the application.
- **`Time.ts`:** The heartbeat of the game. It uses `window.requestAnimationFrame` to run an infinite loop. It calculates the delta time (milliseconds between the current and last frame) and total elapsed time, dispatching a `tick` event every frame so animations run at a consistent speed regardless of monitor refresh rates.

---

## 🎬 Creating a New Scene

The project is built to easily scale with new menus, cutscenes, and playable levels. Here is the step-by-step process to add a new scene to the game.

### Step 1: Create the Scene Class

Create a new file in `src/Experience/Scenes/` (e.g., `LevelOne.ts`). Your class **must** extend the abstract `Scene` class.

The base `Scene` class automatically provides you with `this.experience` and a `this.container` (`THREE.Group`). **Always add your 3D objects to `this.container`, never directly to the global scene.**

```typescript
import * as THREE from "three";
import Scene from "../Scene";

export default class LevelOne extends Scene {
    myMesh: THREE.Mesh;

    constructor() {
        super(); // Initializes the container

        // Setup your objects
        const geometry = new THREE.TorusGeometry(1, 0.4, 16, 100);
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        this.myMesh = new THREE.Mesh(geometry, material);

        // Add to the scene's specific container
        this.container.add(this.myMesh);
    }

    // This is required by the abstract Scene class
    update() {
        // Animate objects per frame
        this.myMesh.rotation.y += 0.02;
    }
}
```

### Step 2: Register the Scene in `World.ts`

Open `src/Experience/World.ts`. You need to import your new scene and instantiate it inside the `preloadScenes()` method.

```typescript
// 1. Import your scene
import LevelOne from "./Scenes/LevelOne";

export default class World {
    // ...
    preloadScenes() {
        // Existing scenes...
        this.scenes["demo"] = new Demo();

        // 2. Instantiate your new scene and store it in the dictionary
        this.scenes["levelOne"] = new LevelOne();

        // 3. (Optional) Switch to your new scene to test it
        this.switchScene("levelOne");
    }
    // ...
}
```

That's it! The `World` class will automatically handle rendering your `LevelOne` container and will trigger your `update()` method on every frame as long as it is the active scene.

---

## Comming Soon

Game logic and Audio management code will arrive soon to be drivers of the game experience, for now they are under developpment

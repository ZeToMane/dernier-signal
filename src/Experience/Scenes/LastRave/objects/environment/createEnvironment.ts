import {
    CatmullRomCurve3,
    Color,
    Group,
    InstancedMesh,
    Matrix4,
    BoxGeometry,
    Mesh,
    MeshStandardMaterial,
    PointLight,
    NoColorSpace,
    RepeatWrapping,
    SRGBColorSpace,
    SphereGeometry,
    TubeGeometry,
    Vector3,
    type BufferGeometry,
    type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../../layout";
import {
    createMaterials,
    transformedBox,
    transformedCylinder,
    type BunkerMaterials,
} from "./shared";

const INNER_W = SCREEN_WIDTH + 0.024;
const INNER_H = SCREEN_HEIGHT + 0.024;
const BEZEL = 0.155;
const FRAME_Z = 0.05;
const FRAME_DEPTH = 0.1;
const OUTER_W = INNER_W + BEZEL * 2;

function merge(geometries: BufferGeometry[]) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) throw new Error("Failed to merge bunker geometries");
    return merged;
}

function addRivet(
    list: { x: number; y: number; z: number }[],
    x: number,
    y: number,
    z: number,
) {
    list.push({ x, y, z });
}

function buildFrame(materials: BunkerMaterials, rivets: { x: number; y: number; z: number }[]) {
    const group = new Group();
    const steel: BufferGeometry[] = [];
    const dark: BufferGeometry[] = [];

    const topY = INNER_H / 2 + BEZEL / 2;
    const botY = -INNER_H / 2 - BEZEL / 2;
    const leftX = -INNER_W / 2 - BEZEL / 2;
    const rightX = INNER_W / 2 + BEZEL / 2;

    steel.push(transformedBox(OUTER_W, BEZEL, FRAME_DEPTH, 0, topY, FRAME_Z));
    steel.push(transformedBox(OUTER_W, BEZEL, FRAME_DEPTH, 0, botY, FRAME_Z));
    steel.push(transformedBox(BEZEL, INNER_H, FRAME_DEPTH, leftX, 0, FRAME_Z));
    steel.push(transformedBox(BEZEL, INNER_H, FRAME_DEPTH, rightX, 0, FRAME_Z));

    const corner = 0.16;
    const cornerZ = FRAME_Z + 0.012;
    for (const x of [-INNER_W / 2, INNER_W / 2]) {
        for (const y of [-INNER_H / 2, INNER_H / 2]) {
            const sx = Math.sign(x);
            const sy = Math.sign(y);
            dark.push(
                transformedBox(
                    corner,
                    0.034,
                    FRAME_DEPTH + 0.02,
                    x + sx * 0.02,
                    y + sy * 0.04,
                    cornerZ,
                ),
            );
            dark.push(
                transformedBox(
                    0.034,
                    corner,
                    FRAME_DEPTH + 0.02,
                    x + sx * 0.04,
                    y + sy * 0.02,
                    cornerZ,
                ),
            );
            addRivet(rivets, x + sx * 0.055, y + sy * 0.055, FRAME_Z + FRAME_DEPTH / 2 + 0.006);
            addRivet(rivets, x + sx * 0.1, y + sy * 0.02, FRAME_Z + FRAME_DEPTH / 2 + 0.006);
            addRivet(rivets, x + sx * 0.02, y + sy * 0.1, FRAME_Z + FRAME_DEPTH / 2 + 0.006);
        }
    }

    for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        addRivet(rivets, (i / 3.4) * INNER_W * 0.42, topY, FRAME_Z + FRAME_DEPTH / 2 + 0.004);
        addRivet(rivets, (i / 3.4) * INNER_W * 0.42, botY, FRAME_Z + FRAME_DEPTH / 2 + 0.004);
    }
    for (let i = -2; i <= 2; i++) {
        addRivet(rivets, leftX, (i / 2.4) * INNER_H * 0.32, FRAME_Z + FRAME_DEPTH / 2 + 0.004);
        addRivet(rivets, rightX, (i / 2.4) * INNER_H * 0.32, FRAME_Z + FRAME_DEPTH / 2 + 0.004);
    }

    dark.push(
        transformedBox(0.34, 0.055, 0.02, -0.72, topY + 0.01, FRAME_Z + FRAME_DEPTH / 2 + 0.01),
    );

    const reveal = 0.018;
    const revealDepth = 0.07;
    const revealZ = 0.028;
    steel.push(transformedBox(INNER_W + 0.004, reveal, revealDepth, 0, INNER_H / 2 - reveal / 2, revealZ));
    steel.push(transformedBox(INNER_W + 0.004, reveal, revealDepth, 0, -INNER_H / 2 + reveal / 2, revealZ));
    steel.push(transformedBox(reveal, INNER_H, revealDepth, -INNER_W / 2 + reveal / 2, 0, revealZ));
    steel.push(transformedBox(reveal, INNER_H, revealDepth, INNER_W / 2 - reveal / 2, 0, revealZ));

    group.add(new Mesh(merge(steel), materials.steel));
    group.add(new Mesh(merge(dark), materials.darkSteel));

    const strip = 0.01;
    const stripZ = FRAME_Z + 0.01;
    const glowGeos = [
        transformedBox(INNER_W, strip, 0.008, 0, INNER_H / 2 - 0.008, stripZ),
        transformedBox(INNER_W, strip, 0.008, 0, -INNER_H / 2 + 0.008, stripZ),
        transformedBox(strip, INNER_H - 0.02, 0.008, -INNER_W / 2 + 0.008, 0, stripZ),
        transformedBox(strip, INNER_H - 0.02, 0.008, INNER_W / 2 - 0.008, 0, stripZ),
    ];
    const glow = new Mesh(merge(glowGeos), materials.glowStrip);
    group.add(glow);

    return group;
}

function buildPlates(materials: BunkerMaterials, rivets: { x: number; y: number; z: number }[]) {
    const plates: BufferGeometry[] = [];

    const specs: [number, number, number, number, number, number][] = [
        [0.42, 0.55, 0.03, -2.0, 0.42, 0.015],
        [0.34, 0.38, 0.022, -2.02, -0.22, 0.011],
        [0.4, 0.28, 0.034, -1.98, -0.72, 0.017],
        [0.48, 0.4, 0.026, 2.0, 0.38, 0.013],
        [0.32, 0.52, 0.032, 2.04, -0.28, 0.016],
        [0.44, 0.26, 0.02, 1.96, -0.78, 0.01],
        [0.55, 0.16, 0.024, -1.05, 1.12, 0.012],
        [0.38, 0.15, 0.028, 1.12, 1.12, 0.014],
        [0.48, 0.14, 0.022, 0.2, -1.1, 0.011],
        [0.28, 0.16, 0.032, -1.42, -1.08, 0.016],
    ];

    for (const [w, h, d, x, y, z] of specs) {
        plates.push(transformedBox(w, h, d, x, y, z));
        addRivet(rivets, x - w * 0.38, y + h * 0.38, z + d / 2 + 0.004);
        addRivet(rivets, x + w * 0.38, y + h * 0.38, z + d / 2 + 0.004);
        addRivet(rivets, x - w * 0.38, y - h * 0.38, z + d / 2 + 0.004);
        addRivet(rivets, x + w * 0.38, y - h * 0.38, z + d / 2 + 0.004);
    }

    return new Mesh(merge(plates), materials.steel);
}

function buildPipes(materials: BunkerMaterials) {
    const geos: BufferGeometry[] = [];

    geos.push(transformedCylinder(0.034, 3.15, -0.1, 1.13, 0.05, "x", 8));
    geos.push(transformedCylinder(0.034, 0.28, -1.68, 1.02, 0.05, "y", 8));
    geos.push(transformedCylinder(0.046, 0.07, -1.68, 1.13, 0.05, "x", 8));
    geos.push(transformedCylinder(0.046, 0.07, 1.42, 1.13, 0.05, "x", 8));
    geos.push(transformedBox(0.065, 0.045, 0.05, -1.2, 1.13, 0.055));
    geos.push(transformedBox(0.065, 0.045, 0.05, 0.7, 1.13, 0.055));

    geos.push(transformedCylinder(0.026, 1.7, 2.05, 0.02, 0.045, "y", 7));
    geos.push(transformedCylinder(0.038, 0.06, 2.05, 0.7, 0.045, "y", 7));
    geos.push(transformedCylinder(0.038, 0.06, 2.05, -0.62, 0.045, "y", 7));
    geos.push(transformedBox(0.055, 0.07, 0.04, 2.05, 0.28, 0.06));

    geos.push(transformedCylinder(0.02, 1.05, -2.04, -0.12, 0.04, "y", 7));
    geos.push(transformedCylinder(0.02, 0.42, -1.84, -0.64, 0.04, "x", 7));
    geos.push(transformedBox(0.04, 0.04, 0.038, -2.04, -0.64, 0.045));
    // Top mirrors the bottom: elbow, then right into the frame (end hidden under the bezel).
    geos.push(transformedCylinder(0.02, 0.42, -1.84, 0.4, 0.04, "x", 7));
    geos.push(transformedBox(0.04, 0.04, 0.038, -2.04, 0.4, 0.045));

    geos.push(transformedCylinder(0.015, 0.9, -0.95, -1.1, 0.035, "x", 6));
    geos.push(transformedBox(0.038, 0.032, 0.03, -1.28, -1.1, 0.045));
    geos.push(transformedBox(0.038, 0.032, 0.03, -0.62, -1.1, 0.045));

    return new Mesh(merge(geos), materials.darkSteel);
}

export type CableSpec = {
    radius: number;
    points: { x: number; y: number; z: number }[];
};

const P = (x: number, y: number, z: number) => ({ x, y, z });

/**
 * Foreground cables hanging across the corners, well in front of the wall /
 * frame / poster (z ≥ 0.28) so they never clip into anything. Ends run far
 * past the view edges so camera sway / punch never reveals them.
 */
export const DEFAULT_CABLES: CableSpec[] = [
    // Top-left: in from the left, sags, back up out the top.
    {
        radius: 0.034,
        points: [
            P(-3.55, 0.75, 0.34),
            P(-2.25, 0.89, 0.36),
            P(-1.77, 1.04, 0.38),
            P(-1.27, 0.89, 0.4),
            P(-0.99, 1.13, 0.38),
            P(-0.81, 1.425, 0.36),
            P(-0.65, 2.4, 0.34),
        ],
    },
    // Right A: down from the top, bends out the right side.
    {
        radius: 0.034,
        points: [
            P(1.6, 2.35, 0.3),
            P(1.63, 1.25, 0.31),
            P(1.68, 0.67, 0.32),
            P(1.82, 0.53, 0.33),
            P(2.1, 0.5, 0.32),
            P(3.4, 0.58, 0.3),
        ],
    },
    // Right B: longer drop, exits lower right.
    {
        radius: 0.034,
        points: [
            P(1.84, 2.3, 0.42),
            P(1.82, 1.2, 0.43),
            P(1.8, 0.6, 0.44),
            P(1.83, -0.02, 0.45),
            P(1.92, -0.3, 0.44),
            P(2.12, -0.5, 0.42),
            P(3.4, -0.9, 0.4),
        ],
    },
    // Bottom-left A: left edge → out the bottom.
    {
        radius: 0.036,
        points: [
            P(-3.4, -0.38, 0.32),
            P(-2.08, -0.6, 0.33),
            P(-1.83, -0.8, 0.34),
            P(-1.7, -1.2, 0.33),
            P(-1.5, -2.3, 0.3),
        ],
    },
    // Bottom-left B: crosses A, exits further right on the bottom.
    {
        radius: 0.044,
        points: [
            P(-3.26, -1.2, 0.4),
            P(-1.94, -1.04, 0.41),
            P(-1.64, -0.9, 0.42),
            P(-1.28, -0.93, 0.42),
            P(-1.04, -1.2, 0.41),
            P(-0.76, -2.3, 0.38),
        ],
    },
];

function cableCurve({ points }: CableSpec) {
    return new CatmullRomCurve3(points.map(({ x, y, z }) => new Vector3(x, y, z)));
}

function cableGeometry(spec: CableSpec) {
    return new TubeGeometry(cableCurve(spec), 96, spec.radius, 10, false);
}

/** Texture tile spans this many circumferences along the cable (1024×256 → 4:1). */
const CABLE_TILE_CIRCUMFERENCES = 4;

/** One mesh per cable so the debug panel can rebuild a single tube live. */
function buildCables(materials: BunkerMaterials) {
    const group = new Group();
    const specs: CableSpec[] = DEFAULT_CABLES.map((spec) => ({
        radius: spec.radius,
        points: spec.points.map((p) => ({ ...p })),
    }));
    // Own material per cable: the map repeat depends on each cable's length / radius.
    const meshes = specs.map((spec) => {
        const mesh = new Mesh(cableGeometry(spec), materials.rubber.clone());
        group.add(mesh);
        return mesh;
    });

    const syncRepeat = (index: number) => {
        const { map, normalMap, roughnessMap } = meshes[index].material;
        const spec = specs[index];
        const tile = 2 * Math.PI * spec.radius * CABLE_TILE_CIRCUMFERENCES;
        const repeat = cableCurve(spec).getLength() / tile;
        map?.repeat.set(repeat, 1);
        normalMap?.repeat.set(repeat, 1);
        roughnessMap?.repeat.set(repeat, 1);
    };

    const tiled = (texture: Texture, anisotropy: number, colorSpace: string) => {
        const map = texture.clone();
        map.colorSpace = colorSpace;
        map.wrapS = RepeatWrapping;
        map.wrapT = RepeatWrapping;
        map.anisotropy = anisotropy;
        map.needsUpdate = true;
        return map;
    };

    /** Normal map strength, shared by all cables. */
    const NORMAL_SCALE = 0.75;

    return {
        group,
        specs,
        rebuild(index: number) {
            const mesh = meshes[index];
            mesh.geometry.dispose();
            mesh.geometry = cableGeometry(specs[index]);
            syncRepeat(index);
        },
        setTextures(
            textures: { albedo: Texture; normal: Texture; roughness: Texture },
            anisotropy: number,
        ) {
            meshes.forEach((mesh, i) => {
                mesh.material.map = tiled(textures.albedo, anisotropy, SRGBColorSpace);
                mesh.material.normalMap = tiled(textures.normal, anisotropy, NoColorSpace);
                mesh.material.normalScale.set(NORMAL_SCALE, NORMAL_SCALE);
                mesh.material.roughnessMap = tiled(textures.roughness, anisotropy, NoColorSpace);
                // roughness multiplies the map — 1 so the map alone drives it.
                mesh.material.roughness = 1;
                // Rubber base color is near-black — let the texture drive the tint.
                mesh.material.color.set("#ffffff");
                mesh.material.needsUpdate = true;
                syncRepeat(i);
            });
        },
    };
}

function buildFixtures(materials: BunkerMaterials, _rivets: { x: number; y: number; z: number }[]) {
    const group = new Group();
    const steel: BufferGeometry[] = [];

    // Painted boxes: front face shows the texture once (rivets + bars are baked
    // in it, so no 3D ones). Square fronts so the 1024² map isn't stretched.
    const panelFront = new MeshStandardMaterial({ color: "#5a1a16", roughness: 0.7, metalness: 0.3 });
    const panelSide = new MeshStandardMaterial({ color: "#3a0f0c", roughness: 0.75, metalness: 0.3 });
    // Face order: +x, -x, +y, -y, +z (front), -z.
    const faces = [panelSide, panelSide, panelSide, panelSide, panelFront, panelSide];
    const panelSpecs: [size: number, depth: number, x: number, y: number][] = [
        [0.38, 0.08, -2.0, 0.82], // left, 3 status LEDs
        [0.27, 0.07, 2.0, 0.82], // right, status + fault LEDs
        [0.33, 0.09, 1.98, -0.98], // bottom right
        [0.23, 0.06, -2.0, -0.98], // bottom left
    ];
    for (const [size, depth, x, y] of panelSpecs) {
        const panel = new Mesh(new BoxGeometry(size, size, depth), faces);
        panel.position.set(x, y, depth / 2);
        group.add(panel);
    }
    group.userData.panelFront = panelFront;

    steel.push(transformedBox(0.12, 0.18, 0.05, -INNER_W / 2 - 0.02, -0.4, 0.07));
    steel.push(transformedBox(0.16, 0.08, 0.05, INNER_W / 2 + 0.02, 0.32, 0.07));
    group.add(new Mesh(merge(steel), materials.steel));

    const vent = new Mesh(transformedBox(0.32, 0.14, 0.018, 1.28, -1.08, 0.018), materials.grille);
    group.add(vent);

    return group;
}

function buildRivets(
    materials: BunkerMaterials,
    rivets: { x: number; y: number; z: number }[],
) {
    const mesh = new InstancedMesh(new SphereGeometry(0.011, 6, 4), materials.darkSteel, rivets.length);
    const matrix = new Matrix4();
    rivets.forEach((rivet, i) => {
        matrix.makeTranslation(rivet.x, rivet.y, rivet.z);
        mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
}

const LED_RED = new Color("#ff3a2a");
const LED_GREEN = new Color("#22f08f");
const ledScratch = new Color();
const spill = [new Color(), new Color()];
const spillPower = [0, 0];

/** Small spill around each LED — follows its emissive color / intensity each frame. */
const LED_LIGHT_INTENSITY = 0.12;
const LED_LIGHT_DISTANCE = 0.6;

function ledLight(x: number, y: number, z: number) {
    const light = new PointLight(LED_RED, 0, LED_LIGHT_DISTANCE, 2);
    // A touch in front so it grazes the box face instead of sitting inside it.
    light.position.set(x, y, z + 0.03);
    return light;
}

function buildLeds(materials: BunkerMaterials) {
    const group = new Group();
    const geo = new SphereGeometry(0.016, 8, 6);

    // Status LEDs: red while the screen is off, green once it's on.
    // `steady` = always lit, `blink` = blinks in the status color, `fault` = blinks red always.
    // Own material each so they blink out of sync.
    const statusSpecs: {
        x: number;
        y: number;
        z: number;
        phase: number;
        mode: "steady" | "blink" | "fault";
    }[] = [
        { x: -2.1, y: 0.9, z: 0.086, phase: 0, mode: "steady" },
        { x: -1.9, y: 0.9, z: 0.086, phase: 1.7, mode: "blink" },
        { x: -2.1, y: 0.76, z: 0.086, phase: 3.1, mode: "fault" },
        { x: 2.08, y: 0.78, z: 0.078, phase: 4.4, mode: "blink" },
    ];
    // Perf: one spill light per box (mixed from its LEDs) instead of one per LED —
    // every point light costs a loop iteration on every lit pixel of the scene.
    const boxLights = [ledLight(-2.0, 0.83, 0.086), ledLight(1.99, 0.78, 0.078)];
    group.add(...boxLights);
    const status = statusSpecs.map(({ x, y, z, phase, mode }) => {
        const material = materials.ledGreen.clone();
        const mesh = new Mesh(geo, material);
        mesh.position.set(x, y, z);
        group.add(mesh);
        return { material, phase, mode, box: x < 0 ? 0 : 1 };
    });

    // Fault LED right of the screen — always red.
    const red = new Mesh(geo, materials.ledRed);
    red.position.set(1.9, 0.78, 0.078);
    group.add(red);

    return { group, status, red: materials.ledRed, boxLights, strip: materials.glowStrip };
}

export type EnvironmentState = {
    screenPower: number;
    flicker: number;
    signalStage: number;
};

/** Normal map strength on the painted boxes. */
const PANEL_NORMAL_SCALE = 1.75;

export function createEnvironment() {
    const materials = createMaterials();
    const group = new Group();
    const rivets: { x: number; y: number; z: number }[] = [];

    const leds = buildLeds(materials);
    const fixtures = buildFixtures(materials, rivets);
    const panelFront = fixtures.userData.panelFront as MeshStandardMaterial;
    const cables = buildCables(materials);

    group.add(
        buildFrame(materials, rivets),
        buildPlates(materials, rivets),
        buildPipes(materials),
        cables.group,
        fixtures,
        buildRivets(materials, rivets),
        leds.group,
    );

    let lastStage = -1;
    let pulse = 0;

    return {
        group,
        materials,
        cables,
        /** Painted texture (+ normal map) on the front of the painted boxes. */
        setPanelTextures(
            textures: { albedo: Texture; normal: Texture; roughness: Texture },
            anisotropy: number,
        ) {
            const { albedo, normal, roughness } = textures;
            albedo.colorSpace = SRGBColorSpace;
            albedo.anisotropy = anisotropy;
            normal.colorSpace = NoColorSpace;
            normal.anisotropy = anisotropy;
            panelFront.map = albedo;
            roughness.colorSpace = NoColorSpace;
            roughness.anisotropy = anisotropy;
            panelFront.normalMap = normal;
            panelFront.roughnessMap = roughness;
            // roughness multiplies the map — 1 so the map alone drives it.
            panelFront.roughness = 1;
            panelFront.normalScale.set(PANEL_NORMAL_SCALE, PANEL_NORMAL_SCALE);
            // Base tint only shows without a map — let the texture drive the color.
            panelFront.color.set("#ffffff");
            panelFront.needsUpdate = true;
        },
        update(time: number, dt: number, state: EnvironmentState) {
            if (state.signalStage !== lastStage) {
                lastStage = state.signalStage;
                pulse = state.signalStage >= 4 ? 1.4 : state.signalStage > 0 ? 0.85 : 0;
            }
            pulse = Math.max(0, pulse - dt * 1.1);

            const idle = 0.55 + 0.45 * Math.sin(time * 3.1);
            const blink = Math.sin(time * 7.4) > 0.72 ? 0.25 : 1;
            const live = state.screenPower;
            const surge = pulse * (0.65 + 0.35 * state.flicker);

            spill[0].setRGB(0, 0, 0);
            spill[1].setRGB(0, 0, 0);
            spillPower[0] = 0;
            spillPower[1] = 0;
            const add = (box: number, color: Color, intensity: number) => {
                spill[box].add(ledScratch.copy(color).multiplyScalar(intensity));
                spillPower[box] += intensity;
            };
            for (const led of leds.status) {
                const on =
                    led.mode === "steady" || Math.sin(time * 4.2 + led.phase) > -0.1 ? 1 : 0.06;
                if (led.mode === "fault") {
                    led.material.emissive.copy(LED_RED);
                    led.material.emissiveIntensity = on * 0.65;
                } else {
                    led.material.emissive.lerpColors(LED_RED, LED_GREEN, live);
                    led.material.emissiveIntensity =
                        on * ((1 - live) * 0.65 + live * (0.55 * idle + surge * 1.8) * state.flicker);
                }
                add(led.box, led.material.emissive, led.material.emissiveIntensity);
            }
            leds.red.emissiveIntensity =
                (0.25 + (1 - live) * 0.45) * blink + live * 0.12;
            add(1, LED_RED, leds.red.emissiveIntensity);
            // Box light = summed LED spill: color normalized, intensity = total.
            leds.boxLights.forEach((light, i) => {
                const peak = Math.max(spill[i].r, spill[i].g, spill[i].b);
                if (peak > 1e-4) light.color.copy(spill[i]).multiplyScalar(1 / peak);
                light.intensity = spillPower[i] * LED_LIGHT_INTENSITY;
            });
            leds.strip.emissiveIntensity = live * (1.1 + surge * 1.4) * state.flicker;
        },
    };
}

export type BunkerEnvironment = ReturnType<typeof createEnvironment>;

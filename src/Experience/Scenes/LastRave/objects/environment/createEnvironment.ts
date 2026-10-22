import {
    CatmullRomCurve3,
    Group,
    InstancedMesh,
    Matrix4,
    Mesh,
    SphereGeometry,
    TubeGeometry,
    Vector3,
    type BufferGeometry,
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

    geos.push(transformedCylinder(0.015, 0.9, -0.95, -1.1, 0.035, "x", 6));
    geos.push(transformedBox(0.038, 0.032, 0.03, -1.28, -1.1, 0.045));
    geos.push(transformedBox(0.038, 0.032, 0.03, -0.62, -1.1, 0.045));

    return new Mesh(merge(geos), materials.darkSteel);
}

function tube(points: Vector3[], radius: number) {
    const curve = new CatmullRomCurve3(points);
    return new TubeGeometry(curve, 18, radius, 5, false);
}

function buildCables(materials: BunkerMaterials) {
    const geos: BufferGeometry[] = [
        tube(
            [
                new Vector3(-INNER_W / 2, -0.42, 0.07),
                new Vector3(-INNER_W / 2 - 0.1, -0.5, 0.08),
                new Vector3(-1.92, -0.62, 0.055),
                new Vector3(-2.0, -0.88, 0.05),
                new Vector3(-1.86, -1.08, 0.06),
            ],
            0.018,
        ),
        tube(
            [
                new Vector3(-INNER_W / 2, -0.38, 0.065),
                new Vector3(-INNER_W / 2 - 0.08, -0.44, 0.07),
                new Vector3(-1.92, -0.55, 0.05),
                new Vector3(-1.98, -0.82, 0.045),
                new Vector3(-1.72, -1.06, 0.055),
            ],
            0.012,
        ),
        tube(
            [
                new Vector3(-INNER_W / 2 + 0.18, -INNER_H / 2, 0.07),
                new Vector3(-0.95, -INNER_H / 2 - 0.12, 0.08),
                new Vector3(-0.55, -1.08, 0.05),
                new Vector3(0.15, -1.1, 0.045),
                new Vector3(0.82, -1.06, 0.06),
            ],
            0.015,
        ),
        tube(
            [
                new Vector3(INNER_W / 2, 0.35, 0.07),
                new Vector3(INNER_W / 2 + 0.12, 0.42, 0.075),
                new Vector3(1.96, 0.5, 0.05),
                new Vector3(2.04, 0.18, 0.04),
                new Vector3(1.98, -0.12, 0.055),
            ],
            0.014,
        ),
        tube(
            [
                new Vector3(INNER_W / 2, 0.28, 0.065),
                new Vector3(INNER_W / 2 + 0.09, 0.32, 0.07),
                new Vector3(1.94, 0.16, 0.048),
                new Vector3(2.04, -0.32, 0.04),
                new Vector3(1.94, -0.72, 0.05),
            ],
            0.009,
        ),
        tube(
            [
                new Vector3(-1.15, INNER_H / 2, 0.07),
                new Vector3(-1.25, INNER_H / 2 + 0.08, 0.08),
                new Vector3(-1.5, 1.1, 0.05),
                new Vector3(-1.82, 1.1, 0.06),
                new Vector3(-2.0, 0.88, 0.045),
            ],
            0.011,
        ),
        tube(
            [
                new Vector3(0.95, INNER_H / 2, 0.065),
                new Vector3(1.05, 1.08, 0.07),
                new Vector3(1.32, 1.12, 0.05),
                new Vector3(1.68, 1.1, 0.055),
            ],
            0.008,
        ),
    ];

    return new Mesh(merge(geos), materials.rubber);
}

function buildFixtures(materials: BunkerMaterials, rivets: { x: number; y: number; z: number }[]) {
    const group = new Group();
    const paint: BufferGeometry[] = [];
    const steel: BufferGeometry[] = [];

    paint.push(transformedBox(0.34, 0.42, 0.08, -2.0, 0.82, 0.04));
    steel.push(transformedBox(0.3, 0.014, 0.004, -2.0, 0.98, 0.082));
    steel.push(transformedBox(0.3, 0.014, 0.004, -2.0, 0.66, 0.082));
    addRivet(rivets, -2.12, 1.0, 0.082);
    addRivet(rivets, -1.88, 1.0, 0.082);
    addRivet(rivets, -2.12, 0.64, 0.082);
    addRivet(rivets, -1.88, 0.64, 0.082);

    paint.push(transformedBox(0.3, 0.24, 0.07, 2.0, 0.82, 0.035));
    steel.push(transformedBox(0.26, 0.012, 0.004, 2.0, 0.91, 0.072));
    addRivet(rivets, 1.9, 0.91, 0.074);
    addRivet(rivets, 2.1, 0.91, 0.074);

    paint.push(transformedBox(0.36, 0.3, 0.09, 1.98, -0.98, 0.045));
    steel.push(transformedBox(0.32, 0.014, 0.005, 1.98, -0.86, 0.092));
    addRivet(rivets, 1.86, -0.86, 0.094);
    addRivet(rivets, 2.1, -0.86, 0.094);

    paint.push(transformedBox(0.26, 0.2, 0.06, -2.0, -0.98, 0.03));

    steel.push(transformedBox(0.12, 0.18, 0.05, -INNER_W / 2 - 0.02, -0.4, 0.07));
    steel.push(transformedBox(0.16, 0.08, 0.05, INNER_W / 2 + 0.02, 0.32, 0.07));

    group.add(new Mesh(merge(paint), materials.paint));
    group.add(new Mesh(merge(steel), materials.steel));

    const ventA = new Mesh(transformedBox(0.26, 0.32, 0.02, -2.0, 0.12, 0.02), materials.grille);
    const ventB = new Mesh(transformedBox(0.32, 0.14, 0.018, 1.28, -1.08, 0.018), materials.grille);
    group.add(ventA, ventB);

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

function buildLeds(materials: BunkerMaterials) {
    const group = new Group();
    const geo = new SphereGeometry(0.016, 8, 6);

    const greenA = new Mesh(geo, materials.ledGreen);
    greenA.position.set(-2.1, 0.9, 0.086);
    const greenB = new Mesh(geo, materials.ledGreen);
    greenB.position.set(-1.9, 0.9, 0.086);
    const greenC = new Mesh(geo, materials.ledGreen);
    greenC.position.set(2.08, 0.78, 0.078);

    const red = new Mesh(geo, materials.ledRed);
    red.position.set(1.9, 0.78, 0.078);

    const sync = new Mesh(geo, materials.ledGreen);
    sync.position.set(-2.1, 0.76, 0.086);

    group.add(greenA, greenB, greenC, red, sync);
    return { group, green: materials.ledGreen, red: materials.ledRed, strip: materials.glowStrip };
}

export type EnvironmentState = {
    screenPower: number;
    flicker: number;
    signalStage: number;
};

export function createEnvironment() {
    const materials = createMaterials();
    const group = new Group();
    const rivets: { x: number; y: number; z: number }[] = [];

    const leds = buildLeds(materials);

    group.add(
        buildFrame(materials, rivets),
        buildPlates(materials, rivets),
        buildPipes(materials),
        buildCables(materials),
        buildFixtures(materials, rivets),
        buildRivets(materials, rivets),
        leds.group,
    );

    let lastStage = -1;
    let pulse = 0;

    return {
        group,
        materials,
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

            leds.green.emissiveIntensity =
                live * (0.55 * idle + surge * 1.8) * state.flicker;
            leds.red.emissiveIntensity =
                (0.25 + (1 - live) * 0.45) * blink + live * 0.12;
            leds.strip.emissiveIntensity = live * (1.1 + surge * 1.4) * state.flicker;
        },
    };
}

export type BunkerEnvironment = ReturnType<typeof createEnvironment>;

import {
    BoxGeometry,
    BufferAttribute,
    CanvasTexture,
    Color,
    CylinderGeometry,
    Euler,
    Matrix4,
    MeshStandardMaterial,
    NoColorSpace,
    Quaternion,
    RepeatWrapping,
    SRGBColorSpace,
    Vector2,
    Vector3,
    type BufferGeometry,
    type Texture,
} from "three";

export function createRng(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeCanvas(size: number) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return { canvas, ctx: canvas.getContext("2d")! };
}

function grain(ctx: CanvasRenderingContext2D, random: () => number, amount: number) {
    const { width, height } = ctx.canvas;
    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
        const n = (random() - 0.5) * amount;
        data[i] += n;
        data[i + 1] += n;
        data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
}

function toAlbedo(canvas: HTMLCanvasElement) {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
}

function toLinear(canvas: HTMLCanvasElement) {
    const texture = new CanvasTexture(canvas);
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
}

export function createConcreteAlbedo() {
    const { canvas, ctx } = makeCanvas(1024);
    const random = createRng(11);

    ctx.fillStyle = "#141614";
    ctx.fillRect(0, 0, 1024, 1024);

    for (let y = 0; y < 1024; ) {
        const row = 70 + random() * 160;
        for (let x = 0; x < 1024; ) {
            const col = 90 + random() * 240;
            const shade = 16 + Math.floor(random() * 14);
            ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 1})`;
            ctx.fillRect(x + 2, y + 2, col - 4, row - 4);
            ctx.strokeStyle = "rgba(255,255,255,0.025)";
            ctx.strokeRect(x + 6, y + 6, col - 12, row - 12);
            x += col;
        }
        y += row;
    }

    for (let i = 0; i < 18; i++) {
        const x = random() * 1024;
        const y = random() * 1024;
        const r = 40 + random() * 180;
        const g = ctx.createRadialGradient(x, y, 4, x, y, r);
        g.addColorStop(0, `rgba(70, 55, 40, ${0.08 + random() * 0.1})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.moveTo(random() * 1024, random() * 1024);
        ctx.lineTo(random() * 1024, random() * 1024);
        ctx.stroke();
    }

    grain(ctx, random, 18);
    const texture = toAlbedo(canvas);
    texture.repeat.set(2.2, 1.25);
    return texture;
}

export function createConcreteBump() {
    const { canvas, ctx } = makeCanvas(512);
    const random = createRng(19);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 80; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.02 + random() * 0.05})`;
        ctx.fillRect(random() * 512, random() * 512, 8 + random() * 40, 2 + random() * 6);
    }
    grain(ctx, random, 28);
    const texture = toLinear(canvas);
    texture.repeat.set(2.2, 1.25);
    return texture;
}

export function createSteelAlbedo() {
    const { canvas, ctx } = makeCanvas(512);
    const random = createRng(23);
    ctx.fillStyle = "#2a2e2c";
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 40; i++) {
        const y = random() * 512;
        ctx.fillStyle = `rgba(255,255,255,${0.015 + random() * 0.03})`;
        ctx.fillRect(0, y, 512, 1 + random() * 3);
    }

    for (let i = 0; i < 25; i++) {
        ctx.strokeStyle = `rgba(0,0,0,${0.08 + random() * 0.12})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(random() * 512, random() * 512);
        ctx.lineTo(random() * 512, random() * 512);
        ctx.stroke();
    }

    for (let i = 0; i < 12; i++) {
        const x = random() * 512;
        const y = random() * 200;
        const g = ctx.createLinearGradient(x, y, x, y + 200 + random() * 200);
        g.addColorStop(0, `rgba(90, 45, 22, ${0.12 + random() * 0.18})`);
        g.addColorStop(1, "rgba(90,45,22,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 6 + random() * 18, 280);
    }

    grain(ctx, random, 16);
    return toAlbedo(canvas);
}

export function createSteelRoughness() {
    const { canvas, ctx } = makeCanvas(512);
    const random = createRng(29);
    ctx.fillStyle = "#c8c8c8";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(255,255,255,${random() * 0.2})`;
        ctx.fillRect(0, random() * 512, 512, 2 + random() * 8);
    }
    grain(ctx, random, 40);
    return toLinear(canvas);
}

export function createGrilleAlbedo() {
    const { canvas, ctx } = makeCanvas(256);
    ctx.fillStyle = "#1a1c1b";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#0b0c0b";
    for (let y = 10; y < 246; y += 14) {
        ctx.fillRect(8, y, 240, 6);
    }
    ctx.fillStyle = "#2e3230";
    ctx.fillRect(0, 0, 256, 8);
    ctx.fillRect(0, 248, 256, 8);
    ctx.fillRect(0, 0, 8, 256);
    ctx.fillRect(248, 0, 8, 256);
    return toAlbedo(canvas);
}

const boxProto = new BoxGeometry(1, 1, 1);
const quat = new Quaternion();
const euler = new Euler();
const pos = new Vector3();
const scale = new Vector3();
const matrix = new Matrix4();

/** World units covered by one square of the steel texture. */
const STEEL_TILE_SIZE = 0.5;

/**
 * BoxGeometry faces are UV 0–1 regardless of scale — that squashes the texture
 * on long thin panels. Scale UVs by face world size so circles stay circles.
 * Face order in Three.js: +x, -x, +y, -y, +z, -z.
 */
function scaleUnitBoxUVs(
    geometry: BufferGeometry,
    w: number,
    h: number,
    d: number,
    tile: number,
) {
    const uv = geometry.getAttribute("uv");
    if (!(uv instanceof BufferAttribute)) return;

    const faceScale: [number, number][] = [
        [d / tile, h / tile],
        [d / tile, h / tile],
        [w / tile, d / tile],
        [w / tile, d / tile],
        [w / tile, h / tile],
        [w / tile, h / tile],
    ];

    for (let f = 0; f < 6; f++) {
        const [su, sv] = faceScale[f]!;
        for (let v = 0; v < 4; v++) {
            const i = f * 4 + v;
            uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
        }
    }
    uv.needsUpdate = true;
}

export function transformedBox(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
): BufferGeometry {
    const geometry = boxProto.clone();
    scaleUnitBoxUVs(geometry, w, h, d, STEEL_TILE_SIZE);
    euler.set(rx, ry, rz);
    quat.setFromEuler(euler);
    pos.set(x, y, z);
    scale.set(w, h, d);
    matrix.compose(pos, quat, scale);
    geometry.applyMatrix4(matrix);
    return geometry;
}

export function transformedCylinder(
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    axis: "x" | "y" | "z",
    radial = 8,
): BufferGeometry {
    const geometry = new CylinderGeometry(radius, radius, length, radial);
    if (axis === "x") euler.set(0, 0, Math.PI / 2);
    else if (axis === "z") euler.set(Math.PI / 2, 0, 0);
    else euler.set(0, 0, 0);
    quat.setFromEuler(euler);
    pos.set(x, y, z);
    scale.set(1, 1, 1);
    matrix.compose(pos, quat, scale);
    geometry.applyMatrix4(matrix);
    return geometry;
}

export function createMaterials() {
    return {
        steel: new MeshStandardMaterial({
            color: new Color("#9aa29c"),
            roughness: 0.72,
            metalness: 0.45,
        }),
        darkSteel: new MeshStandardMaterial({
            color: new Color("#5a605c"),
            roughness: 0.62,
            metalness: 0.55,
        }),
        rubber: new MeshStandardMaterial({
            color: new Color("#0d0e0d"),
            roughness: 0.92,
            metalness: 0.05,
        }),
        grille: new MeshStandardMaterial({
            map: createGrilleAlbedo(),
            roughness: 0.7,
            metalness: 0.4,
        }),
        paint: new MeshStandardMaterial({
            color: new Color("#1c2420"),
            roughness: 0.78,
            metalness: 0.25,
        }),
        ledGreen: new MeshStandardMaterial({
            color: new Color("#04140c"),
            emissive: new Color("#22f08f"),
            emissiveIntensity: 0,
            roughness: 0.4,
            metalness: 0.1,
            toneMapped: false,
        }),
        ledRed: new MeshStandardMaterial({
            color: new Color("#140404"),
            emissive: new Color("#ff3a2a"),
            emissiveIntensity: 0.4,
            roughness: 0.4,
            metalness: 0.1,
            toneMapped: false,
        }),
        glowStrip: new MeshStandardMaterial({
            color: new Color("#020806"),
            emissive: new Color("#22f08f"),
            emissiveIntensity: 0,
            roughness: 0.5,
            metalness: 0.2,
            toneMapped: false,
        }),
    };
}

export type BunkerMaterials = ReturnType<typeof createMaterials>;

/** Swap procedural placeholders for the authored PBR steel maps. */
export function applySteelTextures(
    materials: BunkerMaterials,
    textures: {
        albedo: Texture;
        roughness: Texture;
        normal: Texture;
    },
    anisotropy: number,
) {
    const { albedo, roughness, normal } = textures;

    // Tiling is baked into mesh UVs (see scaleUnitBoxUVs) — keep repeat at 1.
    for (const texture of [albedo, roughness, normal]) {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.repeat.set(1, 1);
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
    }

    albedo.colorSpace = SRGBColorSpace;
    roughness.colorSpace = NoColorSpace;
    normal.colorSpace = NoColorSpace;

    for (const material of [materials.steel, materials.darkSteel]) {
        material.map = albedo;
        material.roughnessMap = roughness;
        material.normalMap = normal;
        material.normalScale = new Vector2(0.35, 0.35);
        material.needsUpdate = true;
    }

    materials.steel.color.set("#d0d6d2");
    materials.steel.roughness = 0.75;
    materials.steel.metalness = 0.42;

    materials.darkSteel.color.set("#8a908c");
    materials.darkSteel.roughness = 0.68;
    materials.darkSteel.metalness = 0.55;
}

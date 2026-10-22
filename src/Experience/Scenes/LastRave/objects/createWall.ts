import {
    Mesh,
    MeshStandardMaterial,
    NoColorSpace,
    PlaneGeometry,
    RepeatWrapping,
    SRGBColorSpace,
    Vector2,
    type Texture,
} from "three";

const WALL_WIDTH = 16;
const WALL_HEIGHT = 9;

/** World size of one square concrete tile — keeps U/V aspect 1:1 on the 16×9 plane. */
const CONCRETE_TILE_SIZE = 4;

export type WallLightParams = {
    color: string;
    roughness: number;
    metalness: number;
    normalScale: number;
};

export const DEFAULT_WALL_LIGHT_PARAMS: WallLightParams = {
    color: "#3e4642",
    roughness: 1,
    metalness: 0.6,
    normalScale: 0.2,
};

export function createWall() {
    return new Mesh(
        new PlaneGeometry(WALL_WIDTH, WALL_HEIGHT),
        new MeshStandardMaterial({
            color: DEFAULT_WALL_LIGHT_PARAMS.color,
            roughness: DEFAULT_WALL_LIGHT_PARAMS.roughness,
            metalness: DEFAULT_WALL_LIGHT_PARAMS.metalness,
        }),
    );
}

export function applyWallLightParams(wall: Mesh, params: WallLightParams) {
    const material = wall.material as MeshStandardMaterial;
    material.color.set(params.color);
    material.roughness = params.roughness;
    material.metalness = params.metalness;
    material.normalScale.set(params.normalScale, params.normalScale);
    material.needsUpdate = true;
}

export function applyWallTextures(
    wall: Mesh,
    textures: {
        albedo: Texture;
        roughness: Texture;
        normal: Texture;
    },
    anisotropy: number,
    lightParams: WallLightParams = DEFAULT_WALL_LIGHT_PARAMS,
) {
    const { albedo, roughness, normal } = textures;

    const repeatX = WALL_WIDTH / CONCRETE_TILE_SIZE;
    const repeatY = WALL_HEIGHT / CONCRETE_TILE_SIZE;

    for (const texture of [albedo, roughness, normal]) {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
    }

    // Color vs data maps — wrong spaces make normals look cratered / oily.
    albedo.colorSpace = SRGBColorSpace;
    roughness.colorSpace = NoColorSpace;
    normal.colorSpace = NoColorSpace;

    const material = wall.material as MeshStandardMaterial;
    material.map = albedo;
    material.roughnessMap = roughness;
    material.normalMap = normal;
    // Ensure normalScale exists before applyWallLightParams.
    material.normalScale = new Vector2(1, 1);
    applyWallLightParams(wall, lightParams);
}

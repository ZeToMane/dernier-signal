export interface Source {
    name: string;
    type: "gltfModel" | "texture";
    path: string;
}

export default [
    {
        name: "posterTexture",
        type: "texture",
        path: "/textures/texture-ripped-paper.png",
    },
    {
        name: "posterNormal",
        type: "texture",
        path: "/textures/normal-map-poster.webp",
    },
    {
        name: "posterRoughness",
        type: "texture",
        path: "/textures/texture-poster.webp",
    },
    {
        name: "concreteAlbedo",
        type: "texture",
        path: "/textures/concrete_albedo.webp",
    },
    {
        name: "concreteRoughness",
        type: "texture",
        path: "/textures/concrete_roughness.webp",
    },
    {
        name: "concreteNormal",
        type: "texture",
        path: "/textures/concrete_normal.webp",
    },
    {
        name: "boxAlbedo",
        type: "texture",
        path: "/textures/texture-boitier.webp",
    },
    {
        name: "boxNormal",
        type: "texture",
        path: "/textures/normal-box.png",
    },
    {
        name: "boxRoughness",
        type: "texture",
        path: "/textures/roughmap-box.webp",
    },
    {
        name: "cableAlbedo",
        type: "texture",
        path: "/textures/texture-cable.webp",
    },
    {
        name: "cableNormal",
        type: "texture",
        path: "/textures/normal-cable4.webp",
    },
    {
        name: "cableRoughness",
        type: "texture",
        path: "/textures/cable-rough.webp",
    },
    {
        name: "steelAlbedo",
        type: "texture",
        path: "/textures/steel-albedo.webp",
    },
    {
        name: "steelRoughness",
        type: "texture",
        path: "/textures/steel-roughness.webp",
    },
    {
        name: "steelNormal",
        type: "texture",
        path: "/textures/steel-normal.webp",
    },
    {
        name: "screenOverlay",
        type: "texture",
        path: "/textures/texture-screen.png",
    },
    {
        name: "screenRoughness",
        type: "texture",
        path: "/textures/screen-roughmap.webp",
    },
] as Source[];

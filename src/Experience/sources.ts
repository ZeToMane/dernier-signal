export interface Source {
    name: string;
    type: "gltfModel" | "texture";
    path: string;
}

export default [
    {
        name: "posterTexture",
        type: "texture",
        path: "/textures/ripped-papper.webp",
    },
] as Source[];

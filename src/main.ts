import "@fontsource/orbitron/900.css";
import "@fontsource/share-tech-mono/400.css";
import Experience from "./Experience/Experience";
import "./style.css";

const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
new Experience(canvas);

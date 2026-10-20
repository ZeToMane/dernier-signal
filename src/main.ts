import Experience from "./Experience/Experience";
import "./style.css";

const canvas = document.querySelector("canvas.webgl") as HTMLCanvasElement;
new Experience(canvas);

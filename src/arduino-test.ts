import Arduino from "./Experience/Arduino/Arduino";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const arduino = new Arduino();
const { horn, star, hourglass } = arduino;

const connectButton = $<HTMLButtonElement>("connect");
const disconnectButton = $<HTMLButtonElement>("disconnect");
const ledButton = $<HTMLButtonElement>("led");
const status = $("status");
const log = $("log");

function write(message: string) {
    log.textContent += `${new Date().toLocaleTimeString()}  ${message}\n`;
    log.scrollTop = log.scrollHeight;
}

function flash(id: string) {
    const el = $(id);
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 150);
}

// ---- Connexion ---------------------------------------------------------------
if (!Arduino.supported) {
    status.textContent = "Web Serial non supporté : ouvre la page dans Chrome ou Edge";
    connectButton.disabled = true;
}

connectButton.onclick = () => arduino.connect().catch((e: Error) => write(`Erreur : ${e.message}`));
disconnectButton.onclick = () => arduino.disconnect();
ledButton.onclick = () => arduino.send("V");

arduino.on("connected", () => {
    status.textContent = "connecté";
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    ledButton.disabled = false;
    write("Connecté");
});

arduino.on("disconnected", () => {
    status.textContent = "déconnecté";
    connectButton.disabled = !Arduino.supported;
    disconnectButton.disabled = true;
    ledButton.disabled = true;
    write("Déconnecté");
});

arduino.reconnect().catch(() => {});

// ---- Corne -------------------------------------------------------------------
const hornThreshold = $<HTMLInputElement>("horn-threshold");
let blows = 0;

hornThreshold.oninput = () => {
    horn.threshold = Number(hornThreshold.value);
    $("horn-threshold-value").textContent = hornThreshold.value;
};

arduino.on("micro", (amplitude: number) => {
    $("horn-level").textContent = String(amplitude);
    $<HTMLMeterElement>("horn-meter").value = amplitude;
});

horn.on("blow", () => {
    $("horn-count").textContent = String(++blows);
    flash("horn");
    write("Corne : souffle");
});

// ---- Étoile ------------------------------------------------------------------
const showCalibration = () => {
    $("star-min-value").textContent = star.min.toFixed(0);
    $("star-max-value").textContent = star.max.toFixed(0);
};

$("star-min").onclick = () => { star.calibrate("min"); showCalibration(); };
$("star-max").onclick = () => { star.calibrate("max"); showCalibration(); };

star.on("change", (value: number) => {
    $("star-raw").textContent = String(star.raw);
    $("star-value").textContent = value.toFixed(2);
    $<HTMLMeterElement>("star-meter").value = value;
});

// ---- Sablier -----------------------------------------------------------------
hourglass.on("kick", () => {
    $("hourglass-count").textContent = String(hourglass.count);
    flash("hourglass");
    write("Sablier : kick");
});

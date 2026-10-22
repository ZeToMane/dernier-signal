/** D / F / J — one key per lane. Ignores key repeat and text fields. */
const LANE_BY_CODE: Record<string, number> = {
    KeyD: 0,
    KeyF: 1,
    KeyJ: 2,
};

export class LaneInput {
    private readonly onKeyDown: (event: KeyboardEvent) => void;

    constructor(private readonly onLane: (lane: number) => void) {
        this.onKeyDown = (event) => {
            if (event.repeat) return;
            if (event.target instanceof HTMLInputElement) return;
            if (event.target instanceof HTMLTextAreaElement) return;

            const lane = LANE_BY_CODE[event.code];
            if (lane === undefined) return;
            this.onLane(lane);
        };

        window.addEventListener("keydown", this.onKeyDown);
    }

    dispose() {
        window.removeEventListener("keydown", this.onKeyDown);
    }
}

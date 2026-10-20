/**
 * Chart — the "partition" of the game: which object must play, and when,
 * INSIDE ONE LOOP of the background track. The Conductor repeats it.
 *
 * File format (JSON). A note uses either `t` (seconds in the loop) or `beat`
 * (beats in the loop, converted with the chart's bpm). Never both.
 *
 * {
 *   "name": "recup-sonore",
 *   "loop": "loop",              // id of the loop in the AudioEngine
 *   "drop": "drop",              // id of the drop track
 *   "bpm": 128,                  // required only if notes use "beat"
 *   "beatsPerLoop": 16,          // optional: lets us check your loop file length
 *   "notes": [
 *     { "beat": 0,   "device": "button", "sample": "kick" },
 *     { "beat": 2.5, "device": "breath", "sample": "pad"  },
 *     { "t": 3.75,   "device": "sound",  "sample": "snare" }
 *   ]
 * }
 */

import type { ChartNote } from './Conductor';

export interface ChartFileNote {
  t?: number;
  beat?: number;
  device: string;
  sample?: string;
}

export interface ChartFile {
  name?: string;
  loop: string;
  drop: string;
  bpm?: number;
  beatsPerLoop?: number;
  notes: ChartFileNote[];
}

/** The validated, ready-to-use chart. All note times are in seconds. */
export interface Chart {
  name: string;
  loopId: string;
  dropId: string;
  bpm?: number;
  beatsPerLoop?: number;
  notes: ChartNote[]; // sorted by t
}

export class ChartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartError';
  }
}

// -----------------------------------------------------------------------------
// Parsing & validation (throws ChartError with a precise message)
// -----------------------------------------------------------------------------

export function parseChart(raw: unknown): Chart {
  if (!isRecord(raw)) throw new ChartError('Chart must be a JSON object.');

  const loopId = requireString(raw, 'loop');
  const dropId = requireString(raw, 'drop');
  const name = typeof raw.name === 'string' ? raw.name : 'untitled';
  const bpm = optionalPositive(raw, 'bpm');
  const beatsPerLoop = optionalPositive(raw, 'beatsPerLoop');

  const rawNotes = raw.notes;
  if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
    throw new ChartError('"notes" must be a non-empty array.');
  }

  const notes = rawNotes.map((n: unknown, i: number) => parseNote(n, i, bpm));
  notes.sort((a, b) => a.t - b.t);

  return { name, loopId, dropId, bpm, beatsPerLoop, notes };
}

export async function loadChart(url: string): Promise<Chart> {
  const res = await fetch(url);
  if (!res.ok) throw new ChartError(`Could not fetch chart "${url}" (${res.status}).`);
  return parseChart(await res.json());
}

function parseNote(n: unknown, i: number, bpm: number | undefined): ChartNote {
  const where = `notes[${i}]`;
  if (!isRecord(n)) throw new ChartError(`${where} must be an object.`);

  const device = n.device;
  if (typeof device !== 'string' || device.trim() === '') {
    throw new ChartError(`${where}.device must be a non-empty string.`);
  }

  const tRaw = n.t;
  const beatRaw = n.beat;
  if ((tRaw === undefined) === (beatRaw === undefined)) {
    throw new ChartError(`${where} needs exactly one of "t" (seconds) or "beat".`);
  }

  let t: number;
  if (tRaw !== undefined) {
    if (!isFiniteNumber(tRaw)) throw new ChartError(`${where}.t must be a finite number.`);
    t = tRaw;
  } else {
    if (!isFiniteNumber(beatRaw)) throw new ChartError(`${where}.beat must be a finite number.`);
    if (bpm === undefined) throw new ChartError(`${where} uses "beat" but the chart has no "bpm".`);
    t = (beatRaw * 60) / bpm;
  }
  if (t < 0) throw new ChartError(`${where} is before the start of the loop (t=${t}).`);

  const sample = n.sample;
  if (sample !== undefined && typeof sample !== 'string') {
    throw new ChartError(`${where}.sample must be a string.`);
  }

  return sample === undefined ? { t, device } : { t, device, sample };
}

// -----------------------------------------------------------------------------
// Sanity checks against the REAL loop (non-fatal: returns human-readable warnings)
// -----------------------------------------------------------------------------

/**
 * Call once the loop is loaded, with `audio.loopDuration` (or the buffer duration).
 * Catches the classic mistakes: a loop file with a bad trim, notes past the end
 * of the loop, notes on one object too close together to tell apart.
 */
export function checkChart(
  chart: Chart,
  loopDuration: number,
  opts: { minSameDeviceGap?: number } = {},
): string[] {
  const minGap = opts.minSameDeviceGap ?? 0.25;
  const warnings: string[] = [];

  if (chart.bpm !== undefined && chart.beatsPerLoop !== undefined) {
    const expected = (chart.beatsPerLoop * 60) / chart.bpm;
    if (Math.abs(expected - loopDuration) > 0.02) {
      warnings.push(
        `Loop file lasts ${loopDuration.toFixed(3)}s but ${chart.beatsPerLoop} beats at ` +
          `${chart.bpm} bpm should last ${expected.toFixed(3)}s: check the trim of the loop file.`,
      );
    }
  }

  for (const n of chart.notes) {
    if (n.t >= loopDuration) {
      warnings.push(`Note ${n.device}@${n.t.toFixed(3)}s is past the end of the loop (${loopDuration.toFixed(3)}s).`);
    }
  }

  const byDevice = new Map<string, number[]>();
  for (const n of chart.notes) {
    const list = byDevice.get(n.device) ?? [];
    list.push(n.t);
    byDevice.set(n.device, list);
  }
  for (const [device, times] of byDevice) {
    // The loop wraps around: also compare the last note with the first of the next pass.
    for (let i = 0; i < times.length; i++) {
      const next = i + 1 < times.length ? times[i + 1] : times[0] + loopDuration;
      if (times.length > 1 && next - times[i] < minGap) {
        warnings.push(
          `"${device}": notes at ${times[i].toFixed(3)}s and ${(next % loopDuration).toFixed(3)}s are ` +
            `${(next - times[i]).toFixed(3)}s apart: too close to tell apart with the current hit windows.`,
        );
      }
    }
  }

  return warnings;
}

/** The distinct devices used by the chart, in order of first appearance. */
export function chartDevices(chart: Chart): string[] {
  return [...new Set(chart.notes.map((n) => n.device))];
}

// -----------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v === '') throw new ChartError(`"${key}" must be a non-empty string.`);
  return v;
}

function optionalPositive(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (v === undefined) return undefined;
  if (!isFiniteNumber(v) || v <= 0) throw new ChartError(`"${key}" must be a positive number.`);
  return v;
}

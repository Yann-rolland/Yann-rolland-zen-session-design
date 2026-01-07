import { AmbianceType } from "@/types";

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function makePinkNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);

  // Voss-McCartney-ish: sum of filtered white-ish sources
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11;
  }
  return buf;
}

function makeWindBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);

  // Lowpassed noise with slow amplitude modulation
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    lp = lp * 0.985 + white * 0.015; // crude low-pass
    const t = i / sr;
    const gust = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.15 * t + 1.2);
    data[i] = lp * gust * 0.35;
  }
  return buf;
}

function makeRainBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);

  // White noise + sparse "drops"
  let hp = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1;
    // crude high-pass: x - lowpass(x)
    prev = prev * 0.995 + white * 0.005;
    hp = white - prev;

    // occasional clicks (drops)
    const drop = Math.random() < 0.004 ? (Math.random() * 2 - 1) * 1.0 : 0;

    const t = i / sr;
    const shower = 0.65 + 0.35 * Math.sin(2 * Math.PI * 0.07 * t + 0.4);
    data[i] = (hp * 0.12 + drop * 0.08) * shower;
  }
  return buf;
}

export function makeNoiseBuffer(ctx: AudioContext, type: AmbianceType): AudioBuffer | null {
  if (type === "none") return null;
  if (type === "pink-noise") return makePinkNoiseBuffer(ctx, 2);
  if (type === "wind") return makeWindBuffer(ctx, 2);
  if (type === "rain") return makeRainBuffer(ctx, 2);

  // Fallback: on mappe les autres ambiances sur une texture proche
  if (type === "forest" || type === "ocean" || type === "fire") return makePinkNoiseBuffer(ctx, 2);
  return makePinkNoiseBuffer(ctx, 2);
}

export function rampGain(g: GainNode | null, target: number, ms = 1500) {
  if (!g) return;
  const ctx = g.context;
  const now = ctx.currentTime;
  const t = now + Math.max(0.01, ms / 1000);
  const v = clamp01(target);
  try {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(v, t);
  } catch {
    g.gain.value = v;
  }
}



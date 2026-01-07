/**
 * Générateurs d’ambiance (WebAudio) — optimisés mobile:
 * - on génère de petits buffers (10–15s) qui bouclent
 * - mono => très léger
 *
 * Note: on évite de créer des fichiers audio lourds pour bruit rose / pluie / vent.
 */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function createPinkNoiseBuffer(audioCtx, seconds = 12) {
  // Algorithme simple "Voss-McCartney" (approx) via filtres IIR cumulés.
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buffer = audioCtx.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);

  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;

  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    // gain doux
    data[i] = pink * 0.11;
  }

  return buffer;
}

export function createWindBuffer(audioCtx, seconds = 12) {
  // Vent léger = bruit filtré + enveloppe lente (variations)
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buffer = audioCtx.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);

  let phase = Math.random() * Math.PI * 2;
  const lfoFreq = 0.08 + Math.random() * 0.05; // très lent

  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    const t = i / sr;
    const lfo = 0.6 + 0.4 * Math.sin(phase + 2 * Math.PI * lfoFreq * t);
    data[i] = white * lfo * 0.12;
  }
  return buffer;
}

export function createRainBuffer(audioCtx, seconds = 12) {
  // Pluie = bruit + petits "impacts" aléatoires (gouttes)
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buffer = audioCtx.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);

  // Bruit de fond
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.05;

  // Gouttes (impulsions amorties)
  const drops = Math.floor(seconds * 35); // densité modérée
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(Math.random() * (len - 1));
    const amp = 0.08 + Math.random() * 0.12;
    const decay = 0.005 + Math.random() * 0.02;
    for (let k = 0; k < sr * 0.08; k++) {
      const idx = start + k;
      if (idx >= len) break;
      const env = Math.exp(-k / (sr * decay));
      data[idx] += amp * env * (Math.random() * 2 - 1);
    }
  }

  // Soft clip
  for (let i = 0; i < len; i++) data[i] = Math.tanh(data[i]);
  return buffer;
}

export function fadeInGain(gainNode, target, ms = 1500) {
  // Safety: si le node n'est pas encore initialisé, on ignore (évite crash UI).
  if (!gainNode) return;
  const t0 = gainNode.context.currentTime;
  const t1 = t0 + ms / 1000;
  gainNode.gain.cancelScheduledValues(t0);
  gainNode.gain.setValueAtTime(0, t0);
  gainNode.gain.linearRampToValueAtTime(clamp01(target), t1);
}

export function setGain(gainNode, target) {
  // Safety: si le node n'est pas encore initialisé, on ignore (évite crash UI).
  if (!gainNode) return;
  gainNode.gain.setValueAtTime(clamp01(target), gainNode.context.currentTime);
}



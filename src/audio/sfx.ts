// Sons gerados com a Web Audio API (sem arquivos de áudio).
// O contexto de áudio só pode começar depois de uma interação do jogador.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function soundEnabled(): boolean {
  return enabled;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Ativa o áudio no primeiro clique ou tecla (exigência dos navegadores).
export function unlockAudioOnGesture(): void {
  const unlock = () => {
    audio();
    window.removeEventListener('mousedown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('mousedown', unlock);
  window.addEventListener('keydown', unlock);
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, volume: number, endFreq?: number): void {
  const a = audio();
  if (!a || !master) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime + start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, a.currentTime + start + duration);
  gain.gain.setValueAtTime(0.0001, a.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, a.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + duration);
  osc.connect(gain).connect(master);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + duration + 0.05);
}

// Sino de alarme: parciais inarmônicos com decaimento longo, tocado algumas vezes.
export function bell(times = 3): void {
  for (let i = 0; i < times; i++) {
    const t = i * 0.55;
    tone(520, t, 1.6, 'sine', 0.5);
    tone(520 * 2.76, t, 0.9, 'sine', 0.18);
    tone(520 * 5.4, t, 0.4, 'sine', 0.08);
  }
}

// Corneta grave (Grande Ataque).
export function horn(): void {
  tone(110, 0, 1.4, 'sawtooth', 0.22, 98);
  tone(165, 0.05, 1.3, 'sawtooth', 0.12, 147);
  tone(110, 1.6, 2.0, 'sawtooth', 0.22, 92);
}

// Baque surdo (morte, destruição).
export function thud(): void {
  tone(90, 0, 0.35, 'triangle', 0.4, 40);
}

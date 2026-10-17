import { BALANCE } from '../data/balance';

// Laço de passo fixo: a simulação avança em ticks constantes, independentemente do FPS.
// A velocidade do jogo multiplica quantos ticks rodam por segundo real.

const TICK_MS = 1000 / BALANCE.time.ticksPerSecond;
const MAX_TICKS_PER_FRAME = 40; // evita travar após a aba ficar muito tempo em segundo plano

export class FixedLoop {
  private acc = 0;

  constructor(private stepFn: () => void) {}

  advance(deltaMs: number, speed: number): void {
    if (speed <= 0) {
      this.acc = 0;
      return;
    }
    this.acc += Math.min(deltaMs, 250) * speed;
    let n = 0;
    while (this.acc >= TICK_MS && n < MAX_TICKS_PER_FRAME) {
      this.stepFn();
      this.acc -= TICK_MS;
      n++;
    }
    if (n === MAX_TICKS_PER_FRAME) this.acc = 0;
  }
}

import { BALANCE } from '../data/balance';
import { getClock, ticksPerDay } from '../core/time';
import type { GameState } from '../state';

export interface DebugActions {
  setSpeed(speed: number): void;
  skipTicks(ticks: number): void;
}

// Painel de desenvolvimento (F3). Serve para testar o balanceamento das eras longas.
export class DebugPanel {
  readonly el = document.createElement('div');
  private infoEl = document.createElement('div');
  private frames = 0;
  private fps = 0;
  private lastFpsTime = performance.now();

  constructor(private state: GameState, actions: DebugActions) {
    this.el.className = 'debug panel hidden';
    const title = document.createElement('b');
    title.textContent = 'Debug (F3)';
    const btns = document.createElement('div');
    btns.className = 'btns';
    const add = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = fn;
      btns.appendChild(b);
    };
    for (const s of BALANCE.debugSpeeds) add(`${s}x`, () => actions.setSpeed(s));
    add('+1 hora', () => actions.skipTicks(Math.floor(ticksPerDay() / 24)));
    add('+1 dia', () => actions.skipTicks(ticksPerDay()));
    add('+1000 recursos', () => {
      for (const k of Object.keys(state.resources) as (keyof typeof state.resources)[]) state.resources[k] += 1000;
    });
    this.el.append(title, this.infoEl, btns);
  }

  toggle(): void {
    this.el.classList.toggle('hidden');
  }

  update(): void {
    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsTime));
      this.frames = 0;
      this.lastFpsTime = now;
      if (!this.el.classList.contains('hidden')) {
        const c = getClock(this.state.tick);
        this.infoEl.innerHTML =
          `FPS: ${this.fps}<br>Seed: ${this.state.seed}<br>Tick: ${this.state.tick}<br>` +
          `Dia ${c.day}, ${c.season} (ano ${c.year})<br>Velocidade: ${this.state.speed}x<br>` +
          `Recursos no mapa: ${this.state.world.resourceNodes.length}`;
      }
    }
  }
}

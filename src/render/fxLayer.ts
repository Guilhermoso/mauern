import { Graphics } from 'pixi.js';
import type { Fx } from '../core/sim';

// Efeitos visuais passageiros: vapor dos titãs abatidos, flechas, poeira de destruição e faíscas de golpe.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r0: number;
  r1: number;
  life: number;
  age: number;
  color: number;
  alpha: number;
}

interface Arrow {
  x: number;
  y: number;
  x2: number;
  y2: number;
  age: number;
}

const ARROW_TIME = 0.35;

export class FxLayer {
  readonly g = new Graphics();
  private particles: Particle[] = [];
  private arrows: Arrow[] = [];

  add(list: Fx[]): void {
    for (const f of list) {
      switch (f.type) {
        case 'steam':
          // Os titãs abatidos evaporam numa nuvem de vapor branco.
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 4 + Math.random() * 14;
            this.particles.push({
              x: f.x + Math.cos(a) * f.size * 0.5,
              y: f.y + Math.sin(a) * f.size * 0.5,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp - 10,
              r0: f.size * 0.35,
              r1: f.size * (0.9 + Math.random() * 0.6),
              life: 3 + Math.random() * 2.5,
              age: 0,
              color: 0xf4f4f0,
              alpha: 0.7,
            });
          }
          break;
        case 'dust':
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.push({
              x: f.x + (Math.random() - 0.5) * f.size * 0.6,
              y: f.y + (Math.random() - 0.5) * f.size * 0.6,
              vx: Math.cos(a) * 10,
              vy: Math.sin(a) * 10,
              r0: 6,
              r1: 14 + Math.random() * f.size * 0.25,
              life: 1.4 + Math.random(),
              age: 0,
              color: 0x8a7458,
              alpha: 0.6,
            });
          }
          break;
        case 'hit':
          this.particles.push({ x: f.x, y: f.y, vx: 0, vy: 0, r0: 3, r1: 12, life: 0.25, age: 0, color: 0xffffff, alpha: 0.8 });
          break;
        case 'arrow':
          this.arrows.push({ x: f.x, y: f.y, x2: f.x2, y2: f.y2, age: 0 });
          break;
      }
    }
  }

  update(dt: number): void {
    const g = this.g;
    g.clear();
    this.particles = this.particles.filter((p) => (p.age += dt) < p.life);
    for (const p of this.particles) {
      const k = p.age / p.life;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      g.circle(p.x, p.y, p.r0 + (p.r1 - p.r0) * k).fill({ color: p.color, alpha: p.alpha * (1 - k) });
    }
    this.arrows = this.arrows.filter((a) => (a.age += dt) < ARROW_TIME);
    for (const a of this.arrows) {
      const k = a.age / ARROW_TIME;
      const x = a.x + (a.x2 - a.x) * k;
      // Arco: sobe e desce ao longo do voo.
      const y = a.y + (a.y2 - a.y) * k - Math.sin(k * Math.PI) * 30;
      const ang = Math.atan2(a.y2 - a.y - Math.cos(k * Math.PI) * 30 * Math.PI, a.x2 - a.x);
      g.moveTo(x - Math.cos(ang) * 8, y - Math.sin(ang) * 8).lineTo(x, y).stroke({ width: 1.5, color: 0x3a2a1a });
    }
  }
}

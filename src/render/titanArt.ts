import { Container, Graphics } from 'pixi.js';
import type { Titan } from '../entities/types';
import { titanRadius } from '../systems/damage';
import { lerpColor, shade } from './colors';

// Titã visto de cima: ombros largos, cabeça, braços que balançam ao andar e avançam ao atacar.
// O desenho aponta para +x (a view é girada conforme a direção do titã).

export interface TitanView {
  root: Container;
  shadow: Graphics;
  body: Container;
  armL: Graphics;
  armR: Graphics;
  lastX: number;
  lastY: number;
  walk: number; // fase da caminhada
}

const HAIR = [0x2b1d14, 0x14110f, 0x6b4a2a, 0xc9a45c];

export function createTitanView(t: Titan): TitanView {
  const R = titanRadius(t.height);
  const skin = lerpColor(0xefd2bb, 0xc8977a, t.skin);
  const hair = HAIR[Math.floor(t.skin * 997) % HAIR.length];
  const root = new Container();
  const shadow = new Graphics();
  shadow.ellipse(R * 0.35, R * 0.55, R * 1.15, R * 0.8).fill({ color: 0x000000, alpha: 0.3 });
  const body = new Container();

  const arm = (side: number) => {
    const g = new Graphics();
    g.roundRect(0, -R * 0.15, R * 0.95, R * 0.3, R * 0.15).fill(shade(skin, 0.92)).stroke({ width: Math.max(1, R * 0.04), color: shade(skin, 0.6) });
    g.circle(R * 0.95, 0, R * 0.19).fill(shade(skin, 0.86)); // mão
    g.position.set(0, side * R * 0.82);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);

  const torso = new Graphics();
  torso.ellipse(0, 0, R * 0.5, R * 0.95).fill(skin).stroke({ width: Math.max(1, R * 0.05), color: shade(skin, 0.6) });
  torso.ellipse(-R * 0.08, 0, R * 0.32, R * 0.7).fill(shade(skin, 0.94));
  const head = new Graphics();
  head.circle(R * 0.08, 0, R * 0.42).fill(skin).stroke({ width: Math.max(1, R * 0.04), color: shade(skin, 0.6) });
  head.circle(-R * 0.04, 0, R * 0.38).fill(hair);
  head.ellipse(R * 0.26, 0, R * 0.17, R * 0.27).fill(skin);
  head.circle(R * 0.34, -R * 0.11, R * 0.045).fill(0x2a1a12); // olhos
  head.circle(R * 0.34, R * 0.11, R * 0.045).fill(0x2a1a12);

  body.addChild(armL, armR, torso, head);
  root.addChild(shadow, body);
  return { root, shadow, body, armL, armR, lastX: t.x, lastY: t.y, walk: 0 };
}

export function updateTitanView(v: TitanView, t: Titan, tick: number, attackCooldownMax: number): void {
  const moved = Math.hypot(t.x - v.lastX, t.y - v.lastY);
  v.lastX = t.x;
  v.lastY = t.y;
  v.walk += moved * 0.08;
  v.root.position.set(t.x, t.y);
  v.root.zIndex = t.y + 4;
  v.body.rotation = t.facing;
  // Golpe: os braços avançam logo depois de atacar.
  const sinceAttack = attackCooldownMax - t.attackCooldown;
  if (t.attackCooldown > 0 && sinceAttack < 0.5) {
    const k = Math.sin((sinceAttack / 0.5) * Math.PI);
    v.armL.rotation = 0.5 - k * 0.6;
    v.armR.rotation = -0.5 + k * 0.6;
  } else {
    const swing = Math.sin(v.walk) * 0.45;
    v.armL.rotation = 0.35 + swing;
    v.armR.rotation = -0.35 + swing;
  }
  // Pisca em vermelho ao levar dano.
  v.body.tint = tick - t.lastHitTick < 4 ? 0xff9090 : 0xffffff;
}

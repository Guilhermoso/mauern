import { Graphics } from 'pixi.js';
import type { PoiKind } from '../entities/types';

// Desenho dos pontos de interesse no chão, centrados em (0,0) — o centro do tile.
// Cumpridos, ficam apagados (ruínas vazias, acampamento abandonado, ninho queimado...).
export function drawPoi(kind: PoiKind, done: boolean): Graphics {
  const g = new Graphics();
  const stone = done ? 0x77736a : 0x9a958a;
  const dark = 0x3a3530;
  switch (kind) {
    case 'ruins': {
      // Pedaços de parede e uma coluna caída.
      g.rect(-26, -20, 14, 30).fill(stone).stroke({ width: 1.5, color: dark });
      g.rect(-8, -8, 18, 12).fill(stone).stroke({ width: 1.5, color: dark });
      g.rect(14, -24, 10, 34).fill(stone).stroke({ width: 1.5, color: dark });
      g.poly([-20, 14, 22, 20, 21, 26, -21, 20]).fill(done ? 0x6a665e : 0x8a857a).stroke({ width: 1.2, color: dark });
      for (const [x, y] of [[-30, 6], [6, 12], [26, 14], [-4, -18]]) g.circle(x, y, 2.5).fill(0x8a857a);
      if (!done) g.circle(0, 0, 4).fill({ color: 0xffd34d, alpha: 0.6 }); // algo brilha entre as pedras
      break;
    }
    case 'survivors': {
      g.poly([-24, 14, -8, -18, 8, 14]).fill(done ? 0x9a8a6a : 0xd8c49a).stroke({ width: 1.5, color: 0x5a4a2a });
      g.moveTo(-8, -18).lineTo(-8, 14).stroke({ width: 1, color: 0x5a4a2a });
      g.circle(18, 10, 5).fill(0x4a3a2a);
      if (!done) {
        g.circle(18, 10, 2.5).fill(0xff9a3c);
        // Gente esperando.
        for (const [x, y] of [[14, -6], [24, -2], [28, 14]]) {
          g.circle(x, y, 5).fill(0x7a5a3a).stroke({ width: 1.2, color: 0xe8e0c8 });
          g.circle(x, y - 1, 2.6).fill(0xe8c39e);
        }
      }
      break;
    }
    case 'nest': {
      g.ellipse(0, 0, 34, 22).fill(done ? 0x4a4a46 : 0x3a2a22).stroke({ width: 3, color: done ? 0x5a5a56 : 0x6a3a2a });
      g.ellipse(0, 2, 22, 13).fill(done ? 0x3a3a36 : 0x2a1a14);
      for (const [x0, y0, x1, y1] of [[-18, -4, -6, 4], [8, -8, 20, 2], [-4, 8, 10, 12]]) {
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 3, color: 0xe8dcc6 });
      }
      if (!done) {
        g.circle(-10, -20, 6).fill({ color: 0xe6e6e6, alpha: 0.35 });
        g.circle(4, -28, 5).fill({ color: 0xe6e6e6, alpha: 0.25 });
      }
      break;
    }
    case 'deposit': {
      // Placa marcando o veio.
      g.rect(-2, -22, 4, 26).fill(0x5a3a1e);
      g.poly([2, -22, 18, -17, 2, -12]).fill(done ? 0x8a8578 : 0xe8c24a).stroke({ width: 1, color: 0x6a4a10 });
      break;
    }
    case 'lore': {
      g.ellipse(4, 18, 16, 6).fill({ color: 0x000000, alpha: 0.25 });
      g.poly([-12, 18, -10, -22, 0, -32, 10, -22, 12, 18]).fill(stone).stroke({ width: 2, color: dark });
      for (const y of [-16, -8, 0]) g.moveTo(-5, y).lineTo(5, y).stroke({ width: 1.6, color: 0x4a4a6a });
      g.circle(0, 9, 3).fill(done ? 0x6a8a90 : 0x5fd3e6);
      break;
    }
  }
  return g;
}

import { Container, Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { BuildingKind } from '../entities/types';
import { PLAYER_COLOR, shade } from './colors';

// Desenho dos edifícios vistos de cima. Coordenadas locais: (0,0) = canto superior esquerdo.
// Retorna também partes animadas (ex.: pás do moinho).

export interface BuildingArt {
  root: Container;
  blades?: Graphics;
}

// Vizinhos de muralha (para os troncos da paliçada se ligarem): bits N, L, S, O, NE, SE, SO, NO.
export const NEIGHBOR_DIRS = [
  [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1],
] as const;

export function drawBuildingArt(kind: BuildingKind, built: boolean, progress01: number, mask = 0): BuildingArt {
  const ts = BALANCE.world.tileSize;
  const size = BUILDING_DEFS[kind].size * ts;
  const root = new Container();
  const def = BUILDING_DEFS[kind];

  if (def.wall || def.gate) {
    const art = def.wall ? drawPalisade(mask, ts) : drawGate(mask, ts);
    if (!built) art.root.alpha = 0.3 + 0.5 * progress01;
    return art;
  }

  if (!built) {
    const g = new Graphics();
    // Fundação de terra batida
    g.rect(2, 2, size - 4, size - 4).fill(0x8a7050);
    g.rect(2, 2, size - 4, size - 4).stroke({ width: 2, color: 0x5e4a33 });
    root.addChild(g);
    if (kind !== 'farm') {
      const preview = drawFinished(kind, size);
      preview.root.alpha = 0.25 + 0.55 * progress01;
      root.addChild(preview.root);
    }
    // Andaime: postes e travessas de madeira
    const sc = new Graphics();
    const posts = kind === 'farm' ? [] : [[4, 4], [size - 8, 4], [4, size - 8], [size - 8, size - 8]];
    for (const [x, y] of posts) sc.rect(x, y, 4, 4).fill(0x5a3d22);
    if (kind !== 'farm') {
      sc.moveTo(6, 6).lineTo(size - 6, size - 6).moveTo(size - 6, 6).lineTo(6, size - 6).stroke({ width: 1.5, color: 0x6b4a2a, alpha: 0.8 });
      sc.rect(6, 6, size - 12, size - 12).stroke({ width: 1.5, color: 0x6b4a2a, alpha: 0.8 });
    }
    root.addChild(sc);
    return { root };
  }
  return drawFinished(kind, size);
}

function logRow(g: Graphics, x0: number, y0: number, x1: number, y1: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / 5));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    g.circle(x + 2, y + 3, 4.6).fill({ color: 0x000000, alpha: 0.18 });
  }
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const y = y0 + ((y1 - y0) * i) / n;
    g.circle(x, y, 4.6).fill(0x7a5230).stroke({ width: 1, color: 0x4a301a });
    g.circle(x - 0.8, y - 0.8, 2.2).fill(0xb3854f);
  }
}

// Paliçada vista de cima: fileiras de topos de troncos ligando o centro aos vizinhos.
function drawPalisade(mask: number, ts: number): BuildingArt {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const c = ts / 2;
  let any = false;
  NEIGHBOR_DIRS.forEach(([dx, dy], i) => {
    if (!(mask & (1 << i))) return;
    // Diagonais só se não houver ligação ortogonal fazendo o mesmo caminho.
    if (i >= 4 && (mask & (1 << (dy < 0 ? 0 : 2)) || mask & (1 << (dx > 0 ? 1 : 3)))) return;
    any = true;
    logRow(g, c, c, c + dx * c, c + dy * c);
  });
  if (!any) logRow(g, c - 6, c, c + 6, c);
  return { root };
}

// Portão: dois pilares e folhas de madeira, na direção da muralha.
function drawGate(mask: number, ts: number): BuildingArt {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const vertical = (mask & 0b0101) !== 0 && (mask & 0b1010) === 0;
  const post = 0x8e8172;
  if (vertical) {
    g.rect(ts / 2 - 7, 0, 14, ts).fill(0x6b4a2a);
    for (let y = 3; y < ts; y += 5) g.rect(ts / 2 - 7, y, 14, 1.2).fill(0x4a301a);
    g.rect(ts / 2 - 8, -3, 16, 7).fill(post);
    g.rect(ts / 2 - 8, ts - 4, 16, 7).fill(post);
  } else {
    g.rect(0, ts / 2 - 7, ts, 14).fill(0x6b4a2a);
    for (let x = 3; x < ts; x += 5) g.rect(x, ts / 2 - 7, 1.2, 14).fill(0x4a301a);
    g.rect(-3, ts / 2 - 8, 7, 16).fill(post);
    g.rect(ts - 4, ts / 2 - 8, 7, 16).fill(post);
  }
  return { root };
}

function shadow(g: Graphics, size: number, off = 8): void {
  g.rect(off, off + 2, size, size).fill({ color: 0x000000, alpha: 0.28 });
}

function drawFinished(kind: BuildingKind, size: number): BuildingArt {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  switch (kind) {
    case 'townCenter': {
      shadow(g, size, 10);
      g.rect(0, 0, size, size).fill(0x9b9284);
      g.rect(4, 4, size - 8, size - 8).fill(0x8a8174);
      const m = 10;
      const roof = 0xa8432f;
      g.poly([m, m, size - m, m, size / 2, size / 2]).fill(shade(roof, 1.15));
      g.poly([size - m, m, size - m, size - m, size / 2, size / 2]).fill(shade(roof, 0.85));
      g.poly([size - m, size - m, m, size - m, size / 2, size / 2]).fill(shade(roof, 0.7));
      g.poly([m, size - m, m, m, size / 2, size / 2]).fill(roof);
      g.moveTo(m, m).lineTo(size - m, size - m).moveTo(size - m, m).lineTo(m, size - m).stroke({ width: 2, color: shade(roof, 0.55) });
      g.circle(size / 2, size / 2, 12).fill(0x7d7468);
      g.circle(size / 2, size / 2, 8).fill(0x6a6258);
      g.rect(size / 2 - 1, size / 2 - 22, 2, 22).fill(0x3a2e22);
      g.poly([size / 2 + 1, size / 2 - 22, size / 2 + 15, size / 2 - 18, size / 2 + 1, size / 2 - 14]).fill(PLAYER_COLOR);
      for (const [x, y] of [[0, 0], [size - 12, 0], [0, size - 12], [size - 12, size - 12]]) {
        g.rect(x, y, 12, 12).fill(0xb1a898);
        g.rect(x + 3, y + 3, 6, 6).fill(0x8a8174);
      }
      break;
    }
    case 'house': {
      shadow(g, size - 8, 8);
      const roof = 0x9c4a2e;
      g.rect(2, 4, size - 4, size - 8).fill(0x7a5634); // paredes
      // Telhado de duas águas com cumeeira horizontal
      g.rect(0, 2, size, size / 2 - 2).fill(shade(roof, 1.12));
      g.rect(0, size / 2, size, size / 2 - 2).fill(shade(roof, 0.78));
      for (let x = 6; x < size; x += 8) {
        g.moveTo(x, 4).lineTo(x, size / 2 - 1).stroke({ width: 1, color: shade(roof, 0.9) });
        g.moveTo(x, size / 2 + 1).lineTo(x, size - 4).stroke({ width: 1, color: shade(roof, 0.6) });
      }
      g.rect(0, size / 2 - 1, size, 2).fill(shade(roof, 0.5));
      g.rect(size - 18, 8, 7, 7).fill(0x5b544c); // chaminé
      g.rect(size - 17, 9, 5, 5).fill(0x2e2a26);
      break;
    }
    case 'lumberCamp': {
      shadow(g, size - 8, 8);
      const roof = 0x7a5a3a;
      g.rect(0, 0, size, size * 0.55).fill(shade(roof, 1.1));
      g.rect(0, size * 0.55 - 3, size, 3).fill(shade(roof, 0.6));
      for (let x = 5; x < size; x += 7) g.moveTo(x, 2).lineTo(x, size * 0.55 - 4).stroke({ width: 1, color: shade(roof, 0.8) });
      // Pilha de toras
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4 - row; i++) {
          const cx = 12 + i * 12 + row * 6;
          const cy = size - 10 - row * 7;
          g.circle(cx, cy, 6).fill(0x8b5e34);
          g.circle(cx, cy, 3.5).fill(0xc8955a);
        }
      }
      break;
    }
    case 'miningCamp': {
      shadow(g, size - 8, 8);
      const roof = 0x5f6670;
      g.rect(0, 0, size, size * 0.55).fill(shade(roof, 1.15));
      g.rect(0, size * 0.55 - 3, size, 3).fill(shade(roof, 0.6));
      for (let x = 5; x < size; x += 7) g.moveTo(x, 2).lineTo(x, size * 0.55 - 4).stroke({ width: 1, color: shade(roof, 0.85) });
      // Monte de pedras e carrinho
      g.ellipse(18, size - 12, 15, 9).fill(0x8f8b83);
      g.circle(12, size - 15, 5).fill(0xa9a59c);
      g.circle(22, size - 10, 5).fill(0x9a968c);
      g.rect(size - 26, size - 22, 20, 14).fill(0x6b4a2c);
      g.rect(size - 24, size - 20, 16, 10).fill(0x7d7a72);
      break;
    }
    case 'mill': {
      shadow(g, size - 12, 10);
      g.circle(size / 2, size / 2, size / 2 - 4).fill(0xb8a888);
      g.circle(size / 2, size / 2, size / 2 - 10).fill(0x8e5a36);
      g.circle(size / 2, size / 2, 7).fill(0x6b4428);
      // Sacos de farinha
      g.ellipse(8, size - 8, 6, 5).fill(0xe6dcc3);
      g.ellipse(17, size - 6, 6, 5).fill(0xd9cfb4);
      const blades = new Graphics();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        blades.poly([0, 0, Math.cos(a - 0.12) * 34, Math.sin(a - 0.12) * 34, Math.cos(a + 0.12) * 34, Math.sin(a + 0.12) * 34]).fill({ color: 0xe9e1cc, alpha: 0.95 });
        blades.moveTo(0, 0).lineTo(Math.cos(a) * 34, Math.sin(a) * 34).stroke({ width: 2, color: 0x5a3d22 });
      }
      blades.position.set(size / 2, size / 2);
      root.addChild(blades);
      return { root, blades };
    }
    case 'watchTower': {
      shadow(g, size - 10, 12);
      g.rect(6, 6, size - 12, size - 12).fill(0x7d7468);
      g.rect(10, 10, size - 20, size - 20).fill(0x6b4a2a);
      // Telhado em pirâmide
      const roof = 0x5a3b26;
      const m = 8;
      g.poly([m, m, size - m, m, size / 2, size / 2]).fill(shade(roof, 1.25));
      g.poly([size - m, m, size - m, size - m, size / 2, size / 2]).fill(shade(roof, 0.95));
      g.poly([size - m, size - m, m, size - m, size / 2, size / 2]).fill(shade(roof, 0.75));
      g.poly([m, size - m, m, m, size / 2, size / 2]).fill(shade(roof, 1.05));
      g.rect(size / 2 - 1, size / 2 - 20, 2, 20).fill(0x3a2e22);
      g.poly([size / 2 + 1, size / 2 - 20, size / 2 + 12, size / 2 - 17, size / 2 + 1, size / 2 - 14]).fill(PLAYER_COLOR);
      break;
    }
    case 'palisade':
    case 'gate':
      break;
    case 'farm': {
      g.rect(1, 1, size - 2, size - 2).fill(0x7b5a36);
      for (let y = 6; y < size - 4; y += 8) {
        g.rect(4, y, size - 8, 3).fill(0x5e4226);
        for (let x = 6; x < size - 6; x += 6) g.circle(x, y - 1.5, 2.2).fill(0x6fa83a);
      }
      // Cerca
      g.rect(0, 0, size, size).stroke({ width: 2, color: 0x9b7a4c });
      break;
    }
  }
  return { root };
}

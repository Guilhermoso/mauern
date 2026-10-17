import { Container, Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { BuildingKind } from '../entities/types';
import { PLAYER_COLOR, shade } from './colors';

// Desenho dos edifícios vistos de cima. Coordenadas locais: (0,0) = canto superior esquerdo.
// Retorna também partes animadas (ex.: pás do moinho).

// Parte do edifício que projeta sombra: um polígono convexo (coordenadas locais, x,y alternados)
// e a altura relativa (8 = uma casa). A sombra é calculada pela camada de entidades conforme o sol.
export interface Caster {
  pts: number[];
  h: number;
}

export function rectCaster(x: number, y: number, w: number, h: number, height: number): Caster {
  return { pts: [x, y, x + w, y, x + w, y + h, x, y + h], h: height };
}

export function circleCaster(cx: number, cy: number, r: number, height: number): Caster {
  const pts: number[] = [];
  for (let i = 0; i < 16; i++) pts.push(cx + Math.cos((i / 16) * Math.PI * 2) * r, cy + Math.sin((i / 16) * Math.PI * 2) * r);
  return { pts, h: height };
}

// Faixa (fileira de troncos) de (x0,y0) a (x1,y1) com meia-largura r.
function stripCaster(x0: number, y0: number, x1: number, y1: number, r: number, height: number): Caster {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const nx = -uy * r;
  const ny = ux * r;
  const ax = x0 - ux * r;
  const ay = y0 - uy * r;
  const bx = x1 + ux * r;
  const by = y1 + uy * r;
  return { pts: [ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny], h: height };
}

export interface BuildingArt {
  root: Container;
  casters?: Caster[]; // partes que projetam sombra
  blades?: Graphics;
  flame?: Graphics;
}

// Vizinhos de muralha (para os troncos da paliçada se ligarem): bits N, L, S, O, NE, SE, SO, NO.
export const NEIGHBOR_DIRS = [
  [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1],
] as const;

export function drawBuildingArt(kind: BuildingKind, built: boolean, progress01: number, mask = 0, level = 1, open = false): BuildingArt {
  const ts = BALANCE.world.tileSize;
  const size = BUILDING_DEFS[kind].size * ts;
  const root = new Container();
  const def = BUILDING_DEFS[kind];

  if (def.wall || def.gate) {
    const art = def.wall ? drawPalisade(mask, ts) : drawGate(mask, ts, open && built);
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
      const preview = drawFinished(kind, size, level);
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
  return drawFinished(kind, size, level);
}

function logRow(g: Graphics, x0: number, y0: number, x1: number, y1: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.round(len / 5));
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
  const casters: Caster[] = [];
  NEIGHBOR_DIRS.forEach(([dx, dy], i) => {
    if (!(mask & (1 << i))) return;
    // Diagonais só se não houver ligação ortogonal fazendo o mesmo caminho.
    if (i >= 4 && (mask & (1 << (dy < 0 ? 0 : 2)) || mask & (1 << (dx > 0 ? 1 : 3)))) return;
    any = true;
    logRow(g, c, c, c + dx * c, c + dy * c);
    casters.push(stripCaster(c, c, c + dx * c, c + dy * c, 4.6, 5));
  });
  if (!any) {
    logRow(g, c - 6, c, c + 6, c);
    casters.push(stripCaster(c - 6, c, c + 6, c, 4.6, 5));
  }
  return { root, casters };
}

// Portão: dois pilares e folhas de madeira, na direção da muralha.
function drawGate(mask: number, ts: number, open = false): BuildingArt {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  const vertical = (mask & 0b0101) !== 0 && (mask & 0b1010) === 0;
  const post = 0x8e8172;
  const casters = [vertical ? rectCaster(ts / 2 - 8, -3, 16, ts + 6, 6) : rectCaster(-3, ts / 2 - 8, ts + 6, 16, 6)];
  if (open) {
    // Aberto: só os pilares, e as duas folhas giradas para o lado, deixando a passagem livre.
    const leaf = 0x6b4a2a;
    if (vertical) {
      g.rect(ts / 2 - 8, -3, 16, 7).fill(post);
      g.rect(ts / 2 - 8, ts - 4, 16, 7).fill(post);
      g.rect(ts / 2 - 9, 3, 4, ts / 2 - 3).fill(leaf);
      g.rect(ts / 2 + 5, ts / 2, 4, ts / 2 - 3).fill(leaf);
    } else {
      g.rect(-3, ts / 2 - 8, 7, 16).fill(post);
      g.rect(ts - 4, ts / 2 - 8, 7, 16).fill(post);
      g.rect(3, ts / 2 - 9, ts / 2 - 3, 4).fill(leaf);
      g.rect(ts / 2, ts / 2 + 5, ts / 2 - 3, 4).fill(leaf);
    }
    return { root, casters: [rectCaster(vertical ? ts / 2 - 8 : -3, vertical ? -3 : ts / 2 - 8, vertical ? 16 : 7, vertical ? 7 : 16, 6)] };
  }
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
  return { root, casters };
}

function drawFinished(kind: BuildingKind, size: number, level = 1): BuildingArt {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);
  // Partes altas do edifício (projetam sombra; o resto é chão: pátios, cercas baixas, canteiros).
  const casters: Caster[] = [];
  switch (kind) {
    case 'townCenter': {
      casters.push(rectCaster(0, 0, size, size, 10));
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
      if (level <= 1) {
        // Barraca: lona esticada sobre estacas.
        casters.push(rectCaster(6, 8, size - 12, size - 16, 5));
        const cloth = 0xc8b48a;
        g.poly([6, 8, size - 6, 8, size - 6, size / 2]).fill(shade(cloth, 1.08));
        g.poly([6, 8, 6, size / 2, size - 6, size / 2]).fill(shade(cloth, 1.0));
        g.poly([6, size / 2, size - 6, size / 2, size - 6, size - 8]).fill(shade(cloth, 0.8));
        g.poly([6, size / 2, 6, size - 8, size - 6, size - 8]).fill(shade(cloth, 0.86));
        g.moveTo(6, size / 2).lineTo(size - 6, size / 2).stroke({ width: 2, color: 0x6b4a2a });
        for (const [x, y] of [[4, 6], [size - 8, 6], [4, size - 10], [size - 8, size - 10]]) g.rect(x, y, 4, 4).fill(0x5a3d22);
        // Fogueirinha na frente
        g.circle(size / 2, size - 3, 3).fill(0x4a3a2a);
        g.circle(size / 2, size - 3, 1.6).fill(0xff9a3c);
        break;
      }
      const stone = level >= 3;
      casters.push(rectCaster(0, 2, size, size - 4, stone ? 9 : 8));
      const roof = stone ? 0x4f5866 : 0x9c4a2e;
      g.rect(2, 4, size - 4, size - 8).fill(stone ? 0x9a948a : 0x7a5634); // paredes
      // Telhado de duas águas com cumeeira horizontal
      g.rect(0, 2, size, size / 2 - 2).fill(shade(roof, 1.12));
      g.rect(0, size / 2, size, size / 2 - 2).fill(shade(roof, 0.78));
      for (let x = 6; x < size; x += stone ? 6 : 8) {
        g.moveTo(x, 4).lineTo(x, size / 2 - 1).stroke({ width: 1, color: shade(roof, 0.9) });
        g.moveTo(x, size / 2 + 1).lineTo(x, size - 4).stroke({ width: 1, color: shade(roof, 0.6) });
      }
      g.rect(0, size / 2 - 1, size, 2).fill(shade(roof, 0.5));
      g.rect(size - 18, 8, stone ? 9 : 7, stone ? 9 : 7).fill(0x5b544c); // chaminé
      g.rect(size - 17, 9, stone ? 7 : 5, stone ? 7 : 5).fill(0x2e2a26);
      if (stone) {
        // Cantos de pedra aparente
        for (const [x, y] of [[0, 2], [size - 6, 2], [0, size - 8], [size - 6, size - 8]]) g.rect(x, y, 6, 6).fill(0xb3ada2);
      }
      break;
    }
    case 'hospital': {
      // Pavilhão de pedra clara com telhado de duas águas e uma cruz vermelha.
      casters.push(rectCaster(0, 2, size, size - 4, 8));
      g.rect(2, 4, size - 4, size - 8).fill(0xd8d2c4);
      const roof = 0x8c4a3a;
      g.rect(0, 2, size, size / 2 - 2).fill(shade(roof, 1.12));
      g.rect(0, size / 2, size, size / 2 - 2).fill(shade(roof, 0.8));
      g.rect(0, size / 2 - 1, size, 2).fill(shade(roof, 0.5));
      const cx = size / 2;
      const cy = size / 2;
      g.circle(cx, cy, 14).fill(0xf4f1ea).stroke({ width: 1.5, color: 0x9a948a });
      g.rect(cx - 3, cy - 9, 6, 18).fill(0xc8283c);
      g.rect(cx - 9, cy - 3, 18, 6).fill(0xc8283c);
      break;
    }
    case 'refuge': {
      // Paliçada fechada com um galpão coberto e uma bandeira branca no mastro.
      casters.push(rectCaster(12, 14, size - 24, size - 30, 6)); // o galpão (a cerca é baixa)
      g.rect(2, 2, size - 4, size - 4).fill(0x8a7a5a);
      g.rect(2, 2, size - 4, size - 4).stroke({ width: 4, color: 0x6b4a2a });
      for (let i = 4; i < size - 2; i += 6) {
        for (const [x, y] of [[i, 2], [i, size - 2], [2, i], [size - 2, i]]) g.circle(x, y, 2.6).fill(0x7a5230);
      }
      const roof = 0x5f6b4a;
      g.rect(12, 14, size - 24, size - 30).fill(shade(roof, 1.1));
      g.rect(12, 14 + (size - 30) / 2, size - 24, (size - 30) / 2).fill(shade(roof, 0.8));
      g.rect(size / 2 - 7, size - 18, 14, 10).fill(0x3a2a1a); // entrada
      g.rect(size - 18, 6, 2, 18).fill(0x3a2e22);
      g.poly([size - 16, 6, size - 4, 9, size - 16, 12]).fill(0xf2f2ee);
      break;
    }
    case 'trainingGround': {
      // Arena de areia cercada, com bonecos de palha e um suporte de armas.
      g.rect(2, 2, size - 4, size - 4).fill(0xc2a874);
      for (let i = 0; i < 40; i++) g.circle(6 + ((i * 37) % (size - 12)), 6 + ((i * 53) % (size - 12)), 1.2).fill(0xa88f5c);
      g.rect(1, 1, size - 2, size - 2).stroke({ width: 3, color: 0x7a5230 });
      for (let x = 1; x < size; x += 16) {
        g.rect(x - 2, -1, 4, 5).fill(0x5a3d22);
        g.rect(x - 2, size - 4, 4, 5).fill(0x5a3d22);
      }
      for (const [x, y] of [[size * 0.3, size * 0.35], [size * 0.7, size * 0.35]]) {
        g.ellipse(x + 3, y + 5, 8, 4).fill({ color: 0x000000, alpha: 0.25 });
        g.rect(x - 1.5, y - 2, 3, 12).fill(0x6b4a2a);
        g.circle(x, y, 6).fill(0xd9c27a).stroke({ width: 1, color: 0x9c8648 });
        g.rect(x - 8, y + 1, 16, 2.5).fill(0xd9c27a);
      }
      // Suporte de lanças
      g.rect(size - 26, size - 18, 18, 4).fill(0x6b4a2a);
      for (let i = 0; i < 4; i++) g.rect(size - 25 + i * 5, size - 30, 1.5, 16).fill(0x8b5e34);
      break;
    }
    case 'well': {
      casters.push(circleCaster(16, 16, 12, 3));
      g.circle(16, 16, 12).fill(0x8e877b);
      g.circle(16, 16, 12).stroke({ width: 2, color: 0x6a645a });
      g.circle(16, 16, 7.5).fill(0x2f5d86);
      g.circle(14, 14, 2.5).fill({ color: 0xffffff, alpha: 0.35 });
      // Travessa com balde
      g.rect(2, 14.5, 28, 3).fill(0x6b4a2a);
      g.rect(14, 12, 5, 5).fill(0x8b5e34);
      break;
    }
    case 'bonfire': {
      // Bancos de tronco em volta de uma fogueira de pedras.
      const c = size / 2;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        const x = c + Math.cos(a) * 22;
        const y = c + Math.sin(a) * 22;
        g.roundRect(x - 9, y - 3.5, 18, 7, 3).fill(0x7a5230).stroke({ width: 1, color: 0x4a301a });
      }
      g.circle(c, c, 12).fill(0x5d5850);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.circle(c + Math.cos(a) * 11, c + Math.sin(a) * 11, 3).fill(0x8e877b);
      }
      g.circle(c, c, 7).fill(0x2e2318);
      const flame = new Graphics();
      flame.circle(0, 0, 7).fill({ color: 0xff7a1a, alpha: 0.9 });
      flame.circle(0, -1, 4.5).fill({ color: 0xffc23d, alpha: 0.95 });
      flame.circle(0, -1.5, 2).fill({ color: 0xfff1b0 });
      flame.position.set(c, c);
      root.addChild(flame);
      return { root, flame, casters };
    }
    case 'lumberCamp': {
      casters.push(rectCaster(0, 0, size, size * 0.55, 7)); // só o galpão; a pilha de toras fica no chão
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
      casters.push(rectCaster(0, 0, size, size * 0.55, 7)); // só o galpão; o pátio de pedras fica no chão
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
      casters.push(circleCaster(size / 2, size / 2, size / 2 - 4, 12));
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
      return { root, blades, casters };
    }
    case 'watchTower': {
      casters.push(rectCaster(6, 6, size - 12, size - 12, 16));
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
  return { root, casters };
}

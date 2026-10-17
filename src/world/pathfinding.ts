import type { NavGrid } from './nav';

// A* em grade com 8 direções (sem cortar quinas), seguido de suavização por linha de visão.

// Destino: um retângulo de tiles. "adjacent" = chegar ao lado do retângulo (para recursos e edifícios);
// caso contrário, chegar a um tile dentro dele.
export interface Goal {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  adjacent: boolean;
}

export interface PathResult {
  tiles: number[]; // índices de tile (y * width + x), sem incluir o tile inicial
  complete: boolean; // false = o destino é inalcançável; o caminho leva ao ponto mais próximo
}

export function goalKey(g: Goal): string {
  return `${g.x0},${g.y0},${g.x1},${g.y1},${g.adjacent ? 1 : 0}`;
}

export function satisfies(nav: NavGrid, g: Goal, x: number, y: number): boolean {
  if (g.adjacent) {
    if (!nav.isFree(x, y)) return false;
    const inside = x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1;
    if (inside) return false;
    const dx = Math.max(g.x0 - x, 0, x - g.x1);
    const dy = Math.max(g.y0 - y, 0, y - g.y1);
    return Math.max(dx, dy) <= 1;
  }
  return x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1 && nav.isFree(x, y);
}

function heuristic(g: Goal, x: number, y: number): number {
  const dx = Math.max(g.x0 - x, 0, x - g.x1);
  const dy = Math.max(g.y0 - y, 0, y - g.y1);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

// Memória reutilizada entre buscas, para não alocar a cada chamada.
let size = 0;
let gScore = new Float32Array(0);
let fScore = new Float32Array(0);
let cameFrom = new Int32Array(0);
let stamp = new Uint32Array(0);
let closed = new Uint32Array(0);
let heap = new Int32Array(0);
let search = 0;

function ensure(n: number): void {
  if (n === size) return;
  size = n;
  gScore = new Float32Array(n);
  fScore = new Float32Array(n);
  cameFrom = new Int32Array(n);
  stamp = new Uint32Array(n);
  closed = new Uint32Array(n);
  heap = new Int32Array(n * 2);
  search = 0;
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const;

export function findPath(nav: NavGrid, sx: number, sy: number, goal: Goal, maxExpand = 40000): PathResult {
  const w = nav.width;
  ensure(nav.width * nav.height);
  search++;
  if (search === 0xffffffff) {
    stamp.fill(0);
    closed.fill(0);
    search = 1;
  }
  if (satisfies(nav, goal, sx, sy)) return { tiles: [], complete: true };

  const start = sy * w + sx;
  let heapLen = 0;
  const push = (i: number) => {
    let k = heapLen++;
    heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (fScore[heap[p]] <= fScore[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--heapLen];
    let k = 0;
    for (;;) {
      const l = k * 2 + 1;
      const r = l + 1;
      let m = k;
      if (l < heapLen && fScore[heap[l]] < fScore[heap[m]]) m = l;
      if (r < heapLen && fScore[heap[r]] < fScore[heap[m]]) m = r;
      if (m === k) break;
      [heap[m], heap[k]] = [heap[k], heap[m]];
      k = m;
    }
    return top;
  };

  stamp[start] = search;
  gScore[start] = 0;
  fScore[start] = heuristic(goal, sx, sy);
  cameFrom[start] = -1;
  push(start);

  let best = start;
  let bestH = fScore[start];
  let expanded = 0;

  while (heapLen > 0 && expanded < maxExpand) {
    const cur = pop();
    if (closed[cur] === search) continue;
    closed[cur] = search;
    expanded++;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (satisfies(nav, goal, cx, cy)) return { tiles: reconstruct(cur), complete: true };
    const h = heuristic(goal, cx, cy);
    if (h < bestH) {
      bestH = h;
      best = cur;
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!nav.isFree(nx, ny)) continue;
      // Movimento diagonal só se os dois vizinhos ortogonais estiverem livres.
      if (dx !== 0 && dy !== 0 && (!nav.isFree(cx + dx, cy) || !nav.isFree(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni] === search) continue;
      const g = gScore[cur] + cost;
      if (stamp[ni] !== search || g < gScore[ni]) {
        stamp[ni] = search;
        gScore[ni] = g;
        fScore[ni] = g + heuristic(goal, nx, ny) * 1.001;
        cameFrom[ni] = cur;
        push(ni);
      }
    }
  }
  return { tiles: reconstruct(best), complete: false };
}

function reconstruct(end: number): number[] {
  const out: number[] = [];
  for (let i = end; cameFrom[i] !== -1; i = cameFrom[i]) out.push(i);
  return out.reverse();
}

// Verifica se uma linha reta (em coordenadas de tile, com frações) passa só por tiles livres,
// considerando a largura da unidade.
export function lineFree(nav: NavGrid, ax: number, ay: number, bx: number, by: number): boolean {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist / 0.25));
  const r = 0.3;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    if (
      !nav.isFree(Math.floor(px - r), Math.floor(py - r)) ||
      !nav.isFree(Math.floor(px + r), Math.floor(py - r)) ||
      !nav.isFree(Math.floor(px - r), Math.floor(py + r)) ||
      !nav.isFree(Math.floor(px + r), Math.floor(py + r))
    ) {
      return false;
    }
  }
  return true;
}

// Remove waypoints intermediários quando há linha de visão direta. (sx, sy) em tiles fracionários.
export function smoothPath(nav: NavGrid, sx: number, sy: number, tiles: number[]): number[] {
  if (tiles.length <= 1) return tiles;
  const w = nav.width;
  const center = (i: number) => [(i % w) + 0.5, Math.floor(i / w) + 0.5] as const;
  const out: number[] = [];
  let ax = sx;
  let ay = sy;
  let i = 0;
  while (i < tiles.length) {
    let j = Math.min(tiles.length - 1, i + 16);
    while (j > i) {
      const [bx, by] = center(tiles[j]);
      if (lineFree(nav, ax, ay, bx, by)) break;
      j--;
    }
    out.push(tiles[j]);
    [ax, ay] = center(tiles[j]);
    i = j + 1;
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import { findPath, smoothPath, lineFree } from '../src/world/pathfinding';
import { NavGrid } from '../src/world/nav';
import { Tile } from '../src/world/terrain';
import type { World } from '../src/world/world';

function world(w: number, h: number, walls: [number, number][] = []): World {
  const tiles = new Uint8Array(w * h).fill(Tile.Grass);
  for (const [x, y] of walls) tiles[y * w + x] = Tile.Rock;
  return { width: w, height: h, tiles, resourceNodes: [] };
}

describe('findPath', () => {
  it('acha um caminho reto em campo aberto', () => {
    const nav = new NavGrid(world(20, 20));
    const r = findPath(nav, 1, 1, { x0: 10, y0: 1, x1: 10, y1: 1, adjacent: false });
    expect(r.complete).toBe(true);
    expect(r.tiles).toHaveLength(9);
  });

  it('contorna uma parede', () => {
    const wall: [number, number][] = [];
    for (let y = 0; y < 15; y++) wall.push([5, y]);
    const nav = new NavGrid(world(20, 20, wall));
    const r = findPath(nav, 1, 1, { x0: 9, y0: 1, x1: 9, y1: 1, adjacent: false });
    expect(r.complete).toBe(true);
    const w = 20;
    for (const i of r.tiles) expect(nav.isFree(i % w, Math.floor(i / w))).toBe(true);
    expect(r.tiles.some((i) => Math.floor(i / w) >= 15)).toBe(true);
  });

  it('não corta quinas na diagonal', () => {
    const nav = new NavGrid(world(5, 5, [[1, 0], [0, 1]]));
    const r = findPath(nav, 0, 0, { x0: 1, y0: 1, x1: 1, y1: 1, adjacent: false });
    expect(r.complete).toBe(false);
  });

  it('chega ao lado de um alvo bloqueado (modo adjacente)', () => {
    const nav = new NavGrid(world(20, 20, [[10, 10]]));
    const r = findPath(nav, 1, 1, { x0: 10, y0: 10, x1: 10, y1: 10, adjacent: true });
    expect(r.complete).toBe(true);
    const last = r.tiles[r.tiles.length - 1];
    const x = last % 20;
    const y = Math.floor(last / 20);
    expect(Math.max(Math.abs(x - 10), Math.abs(y - 10))).toBe(1);
  });

  it('destino cercado: devolve o ponto alcançável mais próximo', () => {
    const ring: [number, number][] = [];
    for (let x = 8; x <= 12; x++) ring.push([x, 8], [x, 12]);
    for (let y = 9; y <= 11; y++) ring.push([8, y], [12, y]);
    const nav = new NavGrid(world(20, 20, ring));
    const r = findPath(nav, 1, 1, { x0: 10, y0: 10, x1: 10, y1: 10, adjacent: false });
    expect(r.complete).toBe(false);
    expect(r.tiles.length).toBeGreaterThan(0);
  });
});

describe('smoothPath', () => {
  it('reduz um caminho reto a um único waypoint', () => {
    const nav = new NavGrid(world(20, 20));
    const r = findPath(nav, 1, 1, { x0: 10, y0: 1, x1: 10, y1: 1, adjacent: false });
    expect(smoothPath(nav, 1.5, 1.5, r.tiles)).toEqual([1 * 20 + 10]);
  });

  it('não atravessa obstáculos', () => {
    const nav = new NavGrid(world(10, 10, [[5, 5]]));
    expect(lineFree(nav, 2.5, 5.5, 8.5, 5.5)).toBe(false);
    expect(lineFree(nav, 2.5, 2.5, 8.5, 2.5)).toBe(true);
  });
});

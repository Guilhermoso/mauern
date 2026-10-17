import { describe, expect, it } from 'vitest';
import { generateWorld } from '../src/world/generate';
import { getTile, isWalkable } from '../src/world/world';
import { Tile } from '../src/world/terrain';
import { createNewGame } from '../src/state';

describe('generateWorld', () => {
  it('gera o mesmo mapa para a mesma seed', () => {
    const a = generateWorld('teste');
    const b = generateWorld('teste');
    expect(a.tiles).toEqual(b.tiles);
    expect(a.resourceNodes).toEqual(b.resourceNodes);
  });

  it('gera mapas diferentes para seeds diferentes', () => {
    expect(generateWorld('a').tiles).not.toEqual(generateWorld('b').tiles);
  });

  // Vários seeds, para garantir que todo início de partida seja jogável.
  for (const seed of ['alpha', 'beta', 'gamma', 'delta', 'omega', '12345']) {
    it(`garante um início jogável (seed ${seed})`, () => {
      const w = generateWorld(seed);
      const cx = w.width / 2;
      const cy = w.height / 2;
      for (let y = cy - 5; y < cy + 5; y++) {
        for (let x = cx - 5; x < cx + 5; x++) expect(isWalkable(w, x, y)).toBe(true);
      }
      const near = (kind: string, max: number) =>
        w.resourceNodes.filter((n) => n.kind === kind && Math.hypot(n.tx - cx, n.ty - cy) <= max).length;
      expect(near('berries', 12)).toBeGreaterThanOrEqual(4);
      expect(near('stone', 16)).toBeGreaterThanOrEqual(3);
      expect(near('tree', 20)).toBeGreaterThanOrEqual(15);
      // Ferro e cristais ficam longe do início.
      expect(near('iron', 35)).toBe(0);
      expect(near('crystal', 70)).toBe(0);
      expect(w.resourceNodes.some((n) => n.kind === 'iron')).toBe(true);
    });
  }

  it('cada tile tem no máximo um recurso', () => {
    const w = generateWorld('unico');
    const keys = new Set(w.resourceNodes.map((n) => `${n.tx},${n.ty}`));
    expect(keys.size).toBe(w.resourceNodes.length);
  });

  it('o centro do mapa é grama', () => {
    const w = generateWorld('centro');
    expect(getTile(w, w.width / 2, w.height / 2)).toBe(Tile.Grass);
  });
});

describe('createNewGame', () => {
  it('começa com Centro da Vila, 4 aldeões e 1 batedor', () => {
    const s = createNewGame('inicio');
    expect(s.buildings.map((b) => b.kind)).toEqual(['townCenter']);
    expect(s.units.filter((u) => u.kind === 'villager')).toHaveLength(4);
    expect(s.units.filter((u) => u.kind === 'scout')).toHaveLength(1);
    expect(s.resources).toEqual({ food: 200, wood: 150, stone: 50, iron: 0, gold: 0 });
  });

  it('não repete IDs entre recursos e entidades', () => {
    const s = createNewGame('ids');
    const ids = [...s.world.resourceNodes.map((n) => n.id), ...s.buildings.map((b) => b.id), ...s.units.map((u) => u.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.nextId).toBeGreaterThan(Math.max(...ids));
  });
});

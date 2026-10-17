import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { BALANCE } from '../src/data/balance';
import { createNewGame, newBuilding, newUnit, type GameState } from '../src/state';
import { Tile } from '../src/world/terrain';
import { formBattalion, setMode } from '../src/systems/battalions';
import { spawnTitan } from '../src/systems/titans';
import { commandHospital, maxDoctors } from '../src/systems/hospital';
import { landConnectedFrom } from '../src/world/connectivity';
import { addTitan, addVillager, CENTER, flatGame, runSeconds, setNoon } from './helpers';

const TS = BALANCE.world.tileSize;

// Uma ilha (5×5) cercada por água funda, a leste da vila.
function islandGame(): GameState {
  const s = flatGame();
  setNoon(s);
  const w = s.world.width;
  for (let y = CENTER - 8; y <= CENTER + 8; y++) for (let x = CENTER + 22; x <= CENTER + 38; x++) {
    const island = Math.abs(x - (CENTER + 30)) <= 2 && Math.abs(y - CENTER) <= 2;
    s.world.tiles[y * w + x] = island ? Tile.Grass : Tile.DeepWater;
  }
  return s;
}

function soldier(s: GameState, tx: number, ty: number, level = 10) {
  const u = newUnit(s.nextId++, 'militia', `Soldado ${s.nextId}`, (tx + 0.5) * TS, (ty + 0.5) * TS);
  u.level = level;
  u.hp = 9999;
  s.units.push(u);
  return u;
}

describe('titãs em ilhas', () => {
  it('batalhão caçando ignora titã numa ilha inalcançável e não fica preso tentando', () => {
    const s = islandGame();
    const t = addTitan(s, CENTER + 30, CENTER, 3);
    const c = soldier(s, CENTER + 5, CENTER + 5, 40);
    const m = soldier(s, CENTER + 6, CENTER + 5);
    const sim = new Sim(s);
    const b = formBattalion(sim, [c.id, m.id]).battalion!;
    setMode(sim, b.id, 'hunt');
    runSeconds(sim, 5);
    expect(b.order.type === 'attack' && b.order.titanId === t.id).toBe(false);
    expect([c, m].some((u) => u.order.type === 'attack' && u.order.titanId === t.id)).toBe(false);
  });

  it('titã não surge numa ilha isolada', () => {
    const s = islandGame();
    const sim = new Sim(s);
    const t = spawnTitan(sim, 4, undefined, { tx: CENTER + 30, ty: CENTER });
    expect(t).not.toBeNull();
    expect(Math.abs(t!.x / TS - (CENTER + 30)) <= 3 && Math.abs(t!.y / TS - CENTER) <= 3).toBe(false);
  });

  it('pontos de interesse ficam em terra ligada à vila', () => {
    for (const seed of ['ilhas-1', 'ilhas-2', 'ilhas-3']) {
      const s = createNewGame(seed);
      const land = landConnectedFrom(s.world, s.world.width / 2, s.world.height / 2);
      for (const p of s.pois) expect(land[p.ty * s.world.width + p.tx]).toBe(1);
    }
  });
});

describe('vagas de médico', () => {
  it('3 no nível 1 e mais 1 por nível do hospital', () => {
    const s = flatGame();
    const h = newBuilding(s.nextId++, 'hospital', CENTER + 6, CENTER - 8, true);
    s.buildings.push(h);
    expect(maxDoctors(h)).toBe(3);
    h.level = 3;
    expect(maxDoctors(h)).toBe(5);
    h.level = 5;
    expect(maxDoctors(h)).toBe(7);
    h.level = 3;
    const vs = Array.from({ length: 6 }, (_, i) => addVillager(s, CENTER + 2 + i, CENTER + 6));
    const sim = new Sim(s);
    commandHospital(sim, vs.map((v) => v.id), h.id);
    expect(h.doctorIds.length).toBe(5);
  });
});

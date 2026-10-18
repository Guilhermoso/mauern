import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { step } from '../src/core/simulation';
import { BALANCE } from '../src/data/balance';
import { createNewGame } from '../src/state';
import { getClock } from '../src/core/time';
import type { Poi } from '../src/entities/types';
import { nestSpawnPoint, onPoiDiscovered } from '../src/systems/expeditions';
import { CENTER, flatGame, runSeconds, setNoon } from './helpers';

const TS = BALANCE.world.tileSize;

describe('começo da partida', () => {
  it('começa com 2 milicianos e nenhum titã antes do dia 5', () => {
    const s = createNewGame('comeco');
    expect(s.units.filter((u) => u.kind === 'militia')).toHaveLength(BALANCE.start.militia);
    const sim = new Sim(s);
    const perDay = BALANCE.time.ticksPerSecond * BALANCE.time.secondsPerDay;
    while (getClock(s.tick).day < BALANCE.titans.firstSpawnDay) {
      step(sim);
      if (s.titans.length) throw new Error(`titã no dia ${getClock(s.tick).day}`);
    }
    expect(s.tick).toBeGreaterThan(perDay * 3);
  });

  it('ninhos ficam longe da vila e só soltam titãs depois do dia 12', () => {
    const s = createNewGame('ninhos');
    for (const p of s.pois.filter((x) => x.kind === 'nest')) {
      expect(Math.hypot(p.tx - CENTER, p.ty - CENTER)).toBeGreaterThanOrEqual(BALANCE.pois.nestMinDistance - 1);
    }
    const sim = new Sim(s);
    setNoon(s, 5);
    for (let i = 0; i < 50; i++) expect(nestSpawnPoint(sim)).toBeNull();
  });

  it('guardiões do ninho não saem marchando para a vila', () => {
    const s = flatGame();
    setNoon(s, 2);
    const nest: Poi = { id: 1, kind: 'nest', tx: CENTER + 50, ty: CENTER, discovered: true, done: false, progress: 0, value: 0 };
    s.pois = [nest];
    const sim = new Sim(s);
    onPoiDiscovered(sim, nest);
    expect(s.titans.length).toBe(BALANCE.pois.nestGuards);
    runSeconds(sim, 90);
    for (const t of s.titans) expect(Math.hypot(t.x / TS - nest.tx, t.y / TS - nest.ty)).toBeLessThan(BALANCE.pois.nestLeash + 3);
  });
});

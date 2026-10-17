import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { step } from '../src/core/simulation';
import { BALANCE } from '../src/data/balance';
import { BUILDING_DEFS } from '../src/data/defs';
import { createNewGame, newBuilding, newUnit } from '../src/state';
import { getClock, ticksPerDay } from '../src/core/time';
import {
  commandAttack,
  commandGarrison,
  commandBuild,
  commandGather,
  placeBuilding,
  placeWallLine,
  ungarrison,
} from '../src/systems/commands';
import { ringAlarm, stopAlarm } from '../src/systems/combat';
import { completeBuilding } from '../src/systems/units';
import { titanStats } from '../src/systems/titans';
import type { Building, BuildingKind } from '../src/entities/types';
import { addNode, addTitan, addVillager, CENTER, flatGame, runSeconds, setNoon } from './helpers';
import type { GameState } from '../src/state';

function addBuilt(sim: Sim, kind: BuildingKind, tx: number, ty: number): Building {
  const b = newBuilding(sim.nextId(), kind, tx, ty, true);
  sim.state.buildings.push(b);
  sim.occupyBuilding(b);
  return b;
}

// Anel de paliçada ao redor do Centro da Vila (raio em tiles a partir do centro).
function wallRing(sim: Sim, r: number): Building[] {
  const out: Building[] = [];
  for (let x = CENTER - r; x <= CENTER + r; x++) {
    for (let y = CENTER - r; y <= CENTER + r; y++) {
      if (x === CENTER - r || x === CENTER + r || y === CENTER - r || y === CENTER + r) out.push(addBuilt(sim, 'palisade', x, y));
    }
  }
  return out;
}

function addMilitia(s: GameState, tx: number, ty: number) {
  const ts = BALANCE.world.tileSize;
  const u = newUnit(s.nextId++, 'militia', 'Soldado', (tx + 0.5) * ts, (ty + 0.5) * ts);
  s.units.push(u);
  return u;
}

describe('ameaça', () => {
  it('os primeiros dias são calmos e os titãs começam a surgir depois', () => {
    const s = createNewGame('calma');
    const sim = new Sim(s);
    const firstDay = BALANCE.titans.firstSpawnDay;
    while (getClock(s.tick).day < firstDay) step(sim);
    expect(s.titans).toHaveLength(0);
    for (let i = 0; i < ticksPerDay() && s.titans.length === 0; i++) step(sim);
    expect(s.titans.length).toBeGreaterThan(0);
    // Surgem longe do centro (medido no momento em que surgem).
    const t = s.titans[0];
    const ts = BALANCE.world.tileSize;
    expect(Math.hypot(t.x / ts - CENTER, t.y / ts - CENTER)).toBeGreaterThan(BALANCE.titans.spawnMinDistance - 5);
    expect(t.height).toBeGreaterThanOrEqual(BALANCE.titans.minHeight);
    expect(t.height).toBeLessThanOrEqual(BALANCE.titans.maxHeightByEra[0]);
  });

  it('o Grande Ataque é anunciado na véspera e traz uma horda', () => {
    const s = flatGame();
    const sim = new Sim(s);
    setNoon(s, 5);
    s.threat.nextGreatAttackDay = 7;
    while (getClock(s.tick).day < 6 || getClock(s.tick).hour < 7) step(sim);
    expect(s.threat.greatAttackAnnounced).toBe(true);
    expect(s.log.some((l) => l.text.includes('Grande Ataque amanhã'))).toBe(true);
    while (getClock(s.tick).day < 7 || getClock(s.tick).hour < BALANCE.titans.greatAttackHour + 1) step(sim);
    expect(s.titans.length).toBeGreaterThanOrEqual(BALANCE.titans.greatAttackBase);
    expect(s.threat.nextGreatAttackDay).toBe(14);
  });
});

describe('titãs', () => {
  it('marcham até a cidade e atacam o Centro da Vila', () => {
    const s = flatGame();
    setNoon(s);
    const tc = s.buildings[0];
    addTitan(s, CENTER + 12, CENTER, 5);
    const sim = new Sim(s);
    runSeconds(sim, 40);
    expect(tc.hp).toBeLessThan(BUILDING_DEFS.townCenter.maxHp);
  });

  it('devoram aldeões ao alcance', () => {
    const s = flatGame();
    setNoon(s);
    const u = addVillager(s, CENTER + 8, CENTER + 8);
    addTitan(s, CENTER + 11, CENTER + 8, 5);
    const sim = new Sim(s);
    runSeconds(sim, 20);
    expect(s.units.includes(u)).toBe(false);
    expect(s.log.some((l) => l.text.includes('devorado'))).toBe(true);
  });

  it('a paliçada segura os titãs: eles precisam derrubá-la', () => {
    const s = flatGame();
    setNoon(s);
    const tc = s.buildings[0];
    const sim = new Sim(s);
    const ring = wallRing(sim, 5);
    addTitan(s, CENTER + 14, CENTER, 4);
    runSeconds(sim, 25);
    expect(tc.hp).toBe(BUILDING_DEFS.townCenter.maxHp);
    expect(ring.some((w) => w.hp < BUILDING_DEFS.palisade.maxHp)).toBe(true);
  });

  it('procuram o ponto mais fraco da muralha', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const ring = wallRing(sim, 5);
    // Um segmento fraco, um pouco fora do caminho reto.
    const weak = ring.find((w) => w.tx === CENTER + 5 && w.ty === CENTER + 2)!;
    weak.hp = 20;
    addTitan(s, CENTER + 14, CENTER, 4);
    runSeconds(sim, 30);
    expect(s.buildings.includes(weak)).toBe(false);
    const damagedOthers = ring.filter((w) => w !== weak && w.hp < BUILDING_DEFS.palisade.maxHp);
    expect(damagedOthers).toHaveLength(0);
  });

  it('ficam lentos à noite', () => {
    const day = flatGame();
    setNoon(day);
    const night = flatGame();
    setNoon(night);
    night.tick += Math.round(ticksPerDay() / 2); // meia-noite
    for (const s of [day, night]) addTitan(s, CENTER + 60, CENTER, 5);
    const simD = new Sim(day);
    const simN = new Sim(night);
    const x0 = day.titans[0].x;
    runSeconds(simD, 10);
    runSeconds(simN, 10);
    expect(Math.abs(night.titans[0].x - x0)).toBeLessThan(Math.abs(day.titans[0].x - x0) * 0.5);
  });

  it('regeneram aos poucos', () => {
    const s = flatGame();
    setNoon(s);
    s.buildings = [];
    const t = addTitan(s, CENTER, CENTER, 4);
    t.hp = 100;
    const sim = new Sim(s);
    runSeconds(sim, 10);
    expect(t.hp).toBeGreaterThan(100);
  });
});

describe('combate', () => {
  it('milicianos matam um titã e ele evapora', () => {
    const s = flatGame();
    setNoon(s);
    s.buildings = [];
    const t = addTitan(s, CENTER + 6, CENTER, 3);
    const ms = [0, 1, 2, 3].map((i) => addMilitia(s, CENTER, CENTER + i));
    const sim = new Sim(s);
    commandAttack(sim, ms.map((m) => m.id), t.id);
    runSeconds(sim, 60);
    expect(s.titans).toHaveLength(0);
    expect(s.log.some((l) => l.text.includes('abatido'))).toBe(true);
  });

  it('milicianos parados atacam titãs que chegam perto', () => {
    const s = flatGame();
    setNoon(s);
    s.buildings = [];
    const m = addMilitia(s, CENTER, CENTER);
    addTitan(s, CENTER + 4, CENTER, 3);
    const sim = new Sim(s);
    runSeconds(sim, 1);
    expect(m.order.type).toBe('attack');
  });

  it('a torre de vigia atira flechas nos titãs ao alcance', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    addBuilt(sim, 'watchTower', CENTER + 8, CENTER + 8);
    const t = addTitan(s, CENTER + 12, CENTER + 9, 6);
    const hp0 = t.hp;
    // Paralisa o titã para isolar o teste da torre.
    t.attackCooldown = 999;
    runSeconds(sim, 3);
    expect(t.hp).toBeLessThan(hp0);
    expect(sim.fx.some((f) => f.type === 'arrow')).toBe(true);
  });

  it('o Centro da Vila atira sempre, e mais forte com gente abrigada dentro', () => {
    const run = (garrisoned: number) => {
      const s = flatGame();
      setNoon(s);
      const t = addTitan(s, CENTER + 5, CENTER, 7);
      t.attackCooldown = 999;
      for (let i = 0; i < garrisoned; i++) addVillager(s, CENTER, CENTER - 4 - i).garrison = s.buildings[0].id;
      const sim = new Sim(s);
      runSeconds(sim, 6);
      expect(sim.fx.some((f) => f.type === 'arrow')).toBe(true);
      return t.maxHp - t.hp;
    };
    expect(run(6)).toBeGreaterThan(run(0));
  });
});

describe('abrigo e sino de alarme', () => {
  it('unidades abrigadas não são atacadas e saem quando liberadas', () => {
    const s = flatGame();
    setNoon(s);
    const u = addVillager(s, CENTER + 3, CENTER + 3);
    const sim = new Sim(s);
    commandGarrison(sim, [u.id], s.buildings[0].id);
    runSeconds(sim, 5);
    expect(u.garrison).toBe(s.buildings[0].id);
    addTitan(s, CENTER + 5, CENTER + 5, 7);
    runSeconds(sim, 10);
    expect(s.units.includes(u)).toBe(true);
    ungarrison(sim, s.buildings[0].id);
    expect(u.garrison).toBe(0);
  });

  it('o sino abriga os aldeões e, ao parar, eles voltam ao trabalho', () => {
    const s = flatGame();
    setNoon(s);
    const tree = addNode(s, 'tree', CENTER + 7, CENTER);
    const u = addVillager(s, CENTER + 6, CENTER + 2);
    const sim = new Sim(s);
    commandGather(sim, [u.id], tree.id);
    runSeconds(sim, 3);
    ringAlarm(sim);
    runSeconds(sim, 10);
    expect(u.garrison).toBe(s.buildings[0].id);
    stopAlarm(sim);
    expect(u.garrison).toBe(0);
    expect(u.order.type).toBe('gather');
  });
});

describe('muralhas', () => {
  it('constrói uma linha de paliçada, cobrando por segmento e pulando o que já existe', () => {
    const s = flatGame();
    const u = addVillager(s, CENTER + 6, CENTER + 6);
    const sim = new Sim(s);
    const wood0 = s.resources.wood;
    expect(placeWallLine(sim, 'palisade', CENTER + 5, CENTER - 5, CENTER + 5, CENTER + 4, [u.id])).toBe(10);
    expect(s.resources.wood).toBe(wood0 - 10 * BUILDING_DEFS.palisade.cost.wood!);
    expect(placeWallLine(sim, 'palisade', CENTER + 5, CENTER - 5, CENTER + 5, CENTER + 6, [u.id])).toBe(2);
    runSeconds(sim, 120);
    expect(s.buildings.filter((b) => b.kind === 'palisade' && b.built)).toHaveLength(12);
  });

  it('uma muralha na diagonal não deixa ninguém passar entre os segmentos', () => {
    const s = flatGame();
    const sim = new Sim(s);
    for (let i = 0; i < 6; i++) addBuilt(sim, 'palisade', CENTER + 10 + i, CENTER + 10 + i);
    // Do lado de cima da diagonal para o lado de baixo, o caminho precisa contornar.
    expect(sim.nav.isFree(CENTER + 11, CENTER + 10)).toBe(true);
    const u = addVillager(s, CENTER + 12, CENTER + 11);
    const ts = BALANCE.world.tileSize;
    s.units = [u];
    const sim2 = new Sim(s);
    sim2.state.units[0].order = { type: 'move', tx: CENTER + 11, ty: CENTER + 12 };
    runSeconds(sim2, 1);
    // Não atravessou a diagonal (ainda está longe do destino depois de 1 s).
    expect(Math.hypot(u.x / ts - (CENTER + 11.5), u.y / ts - (CENTER + 12.5))).toBeGreaterThan(0.5);
  });

  it('portão deixa os aldeões passarem, mas não os titãs', () => {
    const s = flatGame();
    setNoon(s);
    s.resources.wood = 500;
    const sim = new Sim(s);
    const ring = wallRing(sim, 5);
    const spot = ring.find((w) => w.tx === CENTER + 5 && w.ty === CENTER)!;
    const { building: gate, error } = placeBuilding(sim, 'gate', spot.tx, spot.ty, []);
    expect(error).toBeUndefined();
    completeBuilding(sim, gate!);
    expect(s.buildings.includes(spot)).toBe(false);
    expect(sim.nav.isFree(gate!.tx, gate!.ty)).toBe(true);
    const tc = s.buildings[0];
    addTitan(s, CENTER + 14, CENTER, 4);
    runSeconds(sim, 25);
    expect(tc.hp).toBe(BUILDING_DEFS.townCenter.maxHp);
  });

  it('aldeões reparam edifícios danificados', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const house = addBuilt(sim, 'house', CENTER + 6, CENTER + 6);
    house.hp = 100;
    const u = addVillager(s, CENTER + 4, CENTER + 6);
    commandBuild(sim, [u.id], house.id);
    runSeconds(sim, 40);
    expect(house.hp).toBe(BUILDING_DEFS.house.maxHp);
  });

  it('uma casa destruída reduz o limite de população', async () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const house = addBuilt(sim, 'house', CENTER + 8, CENTER + 8);
    house.hp = 10;
    const { populationCap } = await import('../src/state');
    expect(populationCap(s)).toBe(10);
    addTitan(s, CENTER + 11, CENTER + 9, 6);
    runSeconds(sim, 20);
    expect(s.buildings.includes(house)).toBe(false);
    expect(populationCap(s)).toBe(5);
  });
});

describe('estatísticas dos titãs', () => {
  it('titãs maiores têm mais vida e dano', () => {
    expect(titanStats(7).maxHp).toBeGreaterThan(titanStats(3).maxHp);
    expect(titanStats(7).damage).toBeGreaterThan(titanStats(3).damage);
  });
});

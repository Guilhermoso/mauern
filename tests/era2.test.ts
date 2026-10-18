import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { step } from '../src/core/simulation';
import { BALANCE } from '../src/data/balance';
import { BUILDING_DEFS } from '../src/data/defs';
import { TECH_DEFS, TECH_IDS } from '../src/data/techs';
import { newBuilding, newUnit, SAVE_VERSION, type GameState } from '../src/state';
import { advanceEra, eraMilestones } from '../src/systems/era';
import { placeBuilding, placeWallLine, trainUnit } from '../src/systems/commands';
import { damageBuilding } from '../src/systems/damage';
import { spawnTitan, titanStats } from '../src/systems/titans';
import { updateBuildingAttacks } from '../src/systems/combat';
import { unitAttack, unitRange } from '../src/systems/modifiers';
import { commandBuild } from '../src/systems/commands';
import { migrate } from '../src/save/migrations';
import { addTitan, addVillager, CENTER, flatGame, runSeconds, setNoon } from './helpers';

const TS = BALANCE.world.tileSize;

function unit(s: GameState, kind: 'archer' | 'spearman' | 'militia', tx: number, ty: number) {
  const u = newUnit(s.nextId++, kind, `Soldado ${s.nextId}`, (tx + 0.5) * TS, (ty + 0.5) * TS);
  u.hp = 9999;
  s.units.push(u);
  return u;
}

function built(s: GameState, kind: Parameters<typeof newBuilding>[1], tx: number, ty: number) {
  const b = newBuilding(s.nextId++, kind, tx, ty, true);
  s.buildings.push(b);
  return b;
}

describe('avanço para a Era II', () => {
  it('só avança com todos os marcos cumpridos, e então libera o conteúdo', () => {
    const s = flatGame();
    setNoon(s, 22);
    const sim0 = new Sim(s);
    expect(advanceEra(sim0)).not.toBeNull();
    expect(s.era).toBe(0);

    // Cumpre todos os marcos: dias, população, vila cercada, casas, pesquisas, hordas, abates e estoque.
    const r = BALANCE.era.toVila;
    for (let i = 0; i < r.population; i++) addVillager(s, CENTER - 3 + (i % 6), CENTER + 4 + Math.floor(i / 6));
    const R = 14;
    for (let x = CENTER - R; x <= CENTER + R; x++) for (const y of [CENTER - R, CENTER + R]) built(s, 'palisade', x, y);
    for (let y = CENTER - R + 1; y < CENTER + R; y++) for (const x of [CENTER - R, CENTER + R]) built(s, 'palisade', x, y);
    for (let i = 0; i < r.level2Houses; i++) built(s, 'house', CENTER - 12 + (i % 5) * 3, CENTER - 12 + Math.floor(i / 5) * 3).level = 2;
    s.techs = TECH_IDS.filter((id) => TECH_DEFS[id].era === 0).slice(0, r.techs);
    s.stats.greatAttacksRepelled = r.greatAttacksRepelled;
    s.stats.titansKilled = r.titansKilled;
    s.resources = { food: 5000, wood: 5000, stone: 5000, iron: 0, gold: 0, wool: 0, bread: 0, clothes: 0 };
    const sim = new Sim(s);
    expect(eraMilestones(sim).filter((m) => !m.done).map((m) => m.label)).toEqual([]);
    expect(advanceEra(sim)).toBeNull();
    expect(s.era).toBe(1);
    expect(s.resources.food).toBe(5000 - (r.cost.food ?? 0));
    expect(s.moraleMods.some((m) => m.reason === 'Nova era')).toBe(true);
  });

  it('edifícios e unidades da Era II ficam bloqueados na Era I', () => {
    const s = flatGame();
    s.resources = { food: 9999, wood: 9999, stone: 9999, iron: 9999, gold: 9999, wool: 0, bread: 0, clothes: 0 };
    const v = addVillager(s, CENTER + 6, CENTER + 6);
    const sim = new Sim(s);
    expect(placeBuilding(sim, 'barracks', CENTER + 8, CENTER + 8, [v.id]).error).toMatch(/Era II/);
    expect(placeWallLine(sim, 'stoneWall', CENTER + 8, CENTER + 2, CENTER + 12, CENTER + 2, [v.id])).toBe(0);
    s.era = 1;
    expect(placeBuilding(sim, 'barracks', CENTER + 8, CENTER + 8, [v.id]).error).toBeUndefined();
    const b = built(s, 'archeryRange', CENTER - 12, CENTER + 6);
    sim.occupyBuilding(b);
    expect(trainUnit(sim, b.id, 'archer')).toBeNull();
    s.era = 0;
    expect(trainUnit(sim, b.id, 'archer')).toMatch(/Era II/);
  });
});

describe('lanceiro e arqueiro', () => {
  it('arqueiro atira de longe, sem chegar perto do titã', () => {
    const s = flatGame();
    setNoon(s);
    s.era = 1;
    const a = unit(s, 'archer', CENTER + 5, CENTER + 5);
    const t = addTitan(s, CENTER + 11, CENTER + 5, 3);
    t.hp = t.maxHp = 1e6;
    const sim = new Sim(s);
    a.order = { type: 'attack', titanId: t.id };
    const x0 = a.x;
    for (let i = 0; i < 40; i++) {
      step(sim);
      t.x = (CENTER + 11.5) * TS; // o titã fica parado
      t.y = (CENTER + 5.5) * TS;
    }
    expect(t.hp).toBeLessThan(1e6);
    expect(Math.abs(a.x - x0)).toBeLessThan(TS);
    expect(unitRange(s, a)).toBe(6);
  });

  it('pesquisas da Era II fortalecem lanceiros e arqueiros', () => {
    const s = flatGame();
    const sp = unit(s, 'spearman', CENTER + 5, CENTER + 5);
    const ar = unit(s, 'archer', CENTER + 6, CENTER + 5);
    const atk0 = unitAttack(s, sp);
    s.techs = ['pikeDrill', 'longbows'];
    expect(unitAttack(s, sp)).toBeCloseTo(atk0 + 4, 5);
    expect(unitRange(s, ar)).toBe(8);
  });

  it('arqueiros abrigados na torre aumentam o dano das flechas', () => {
    const damageWith = (archers: number) => {
      const s = flatGame();
      setNoon(s);
      s.era = 1;
      const tower = built(s, 'stoneTower', CENTER + 8, CENTER + 8);
      for (let i = 0; i < archers; i++) unit(s, 'archer', CENTER, CENTER).garrison = tower.id;
      const t = addTitan(s, CENTER + 12, CENTER + 9, 3);
      t.hp = t.maxHp = 1e6;
      const sim = new Sim(s);
      updateBuildingAttacks(sim);
      return 1e6 - t.hp;
    };
    expect(damageWith(2)).toBeGreaterThan(damageWith(0));
  });
});

describe('muros de pedra', () => {
  it('o muro de pedra pode ser arrastado por cima da paliçada e herda a vida dela durante a obra', () => {
    const s = flatGame();
    s.era = 1;
    s.resources.stone = 999;
    const v = addVillager(s, CENTER + 6, CENTER + 3);
    for (let x = CENTER + 8; x <= CENTER + 12; x++) built(s, 'palisade', x, CENTER + 2);
    const sim = new Sim(s);
    const placed = placeWallLine(sim, 'stoneWall', CENTER + 8, CENTER + 2, CENTER + 12, CENTER + 2, [v.id]);
    expect(placed).toBe(5);
    expect(s.buildings.filter((b) => b.kind === 'palisade')).toHaveLength(0);
    const walls = s.buildings.filter((b) => b.kind === 'stoneWall');
    expect(walls).toHaveLength(5);
    expect(walls.every((b) => !b.built && b.hp === BUILDING_DEFS.palisade.maxHp)).toBe(true);
  });

  it('destruído, vira escombro passável; reconstruído, volta a bloquear', () => {
    const s = flatGame();
    setNoon(s);
    s.era = 1;
    const wall = built(s, 'stoneWall', CENTER + 10, CENTER + 3);
    const v = addVillager(s, CENTER + 8, CENTER + 3);
    const sim = new Sim(s);
    expect(sim.nav.isFree(wall.tx, wall.ty)).toBe(false);
    damageBuilding(sim, wall, 1e9);
    expect(s.buildings.includes(wall)).toBe(true);
    expect(wall.ruined).toBe(true);
    expect(sim.nav.isFree(wall.tx, wall.ty)).toBe(true);
    commandBuild(sim, [v.id], wall.id);
    runSeconds(sim, BUILDING_DEFS.stoneWall.buildTime + 3);
    expect(wall.ruined).toBe(false);
    expect(wall.built).toBe(true);
    expect(sim.nav.isFree(wall.tx, wall.ty)).toBe(false);
  });
});

describe('titãs anormais', () => {
  it('são mais rápidos e resistentes, e só aparecem a partir da Era II', () => {
    const c = titanStats(5, 'common');
    const a = titanStats(5, 'abnormal');
    expect(a.speed).toBeCloseTo(c.speed * BALANCE.titans.abnormal.speedMult, 5);
    expect(a.maxHp).toBeGreaterThan(c.maxHp);
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const t = spawnTitan(sim, 5, undefined, { tx: CENTER + 30, ty: CENTER }, 'abnormal');
    expect(t!.kind).toBe('abnormal');
    expect(t!.maxHp).toBe(a.maxHp);
    // Era I: todos os titãs que surgem pela ameaça são comuns.
    s.threat.nextSpawnTick = 0;
    for (let i = 0; i < 40; i++) {
      s.threat.nextSpawnTick = s.tick + 1;
      step(sim);
    }
    expect(s.titans.filter((x) => x !== t).every((x) => x.kind === 'common')).toBe(true);
  });
});

describe('save', () => {
  it('migra saves v9 (edifícios ganham o campo de escombro)', () => {
    const raw: any = { version: 9, buildings: [{ id: 1, kind: 'palisade' }] };
    const m = migrate(raw);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.buildings[0].ruined).toBe(false);
  });
});

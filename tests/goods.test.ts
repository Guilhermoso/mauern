import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { step } from '../src/core/simulation';
import { BALANCE } from '../src/data/balance';
import { newBuilding, SAVE_VERSION, type GameState } from '../src/state';
import type { BuildingKind } from '../src/entities/types';
import { commandWork, workerOf, workshopProblem } from '../src/systems/workshops';
import { moraleTarget } from '../src/systems/city';
import { lotPrice, recoverPrices, trade } from '../src/systems/market';
import { migrate } from '../src/save/migrations';
import { addVillager, CENTER, flatGame, runSeconds, setNoon } from './helpers';

const C = BALANCE.city;
const TICKS_PER_HOUR = (BALANCE.time.ticksPerSecond * BALANCE.time.secondsPerDay) / 24;

function built(s: GameState, kind: BuildingKind, tx: number, ty: number) {
  const b = newBuilding(s.nextId++, kind, tx, ty, true);
  s.buildings.push(b);
  return b;
}

function workshopGame(kind: BuildingKind) {
  const s = flatGame();
  setNoon(s, 2);
  s.era = 1;
  const b = built(s, kind, CENTER + 8, CENTER + 6);
  const v = addVillager(s, CENTER + 7, CENTER + 5);
  const sim = new Sim(s);
  commandWork(sim, [v.id], b.id);
  return { s, b, v, sim };
}

describe('oficinas', () => {
  it('padaria: o padeiro transforma comida em pão', () => {
    const { s, b, v, sim } = workshopGame('bakery');
    s.resources.food = 100;
    expect(workerOf(sim, b)).toBe(v);
    runSeconds(sim, 30);
    expect(s.resources.bread).toBeGreaterThan(4);
    expect(s.resources.food).toBeLessThan(100);
    expect(workshopProblem(sim, b)).toBe('');
  });

  it('sem matéria-prima, a oficina para', () => {
    const { s, b, sim } = workshopGame('weaver');
    s.resources.wool = 0;
    runSeconds(sim, 20);
    expect(s.resources.clothes).toBe(0);
    expect(workshopProblem(sim, b)).toMatch(/lã/);
    s.resources.wool = 20;
    runSeconds(sim, 20);
    expect(s.resources.clothes).toBeGreaterThan(0);
  });

  it('pasto produz lã, pela metade no inverno', () => {
    const wool = (day: number) => {
      const { s, sim } = workshopGame('pasture');
      setNoon(s, day);
      runSeconds(sim, 40);
      return s.resources.wool;
    };
    const spring = wool(2);
    const winter = wool(32);
    expect(spring).toBeGreaterThan(3);
    expect(winter).toBeLessThan(spring * 0.75);
  });

  it('uma oficina tem um trabalhador só', () => {
    const { s, b, sim } = workshopGame('bakery');
    const other = addVillager(s, CENTER + 6, CENTER + 4);
    expect(commandWork(sim, [other.id], b.id)).toMatch(/já tem/);
  });
});

describe('sobrados', () => {
  function sobradoGame(era: number) {
    const s = flatGame();
    setNoon(s, 3);
    s.era = era;
    const h = built(s, 'house', CENTER + 8, CENTER + 6);
    h.level = 3;
    built(s, 'well', CENTER + 11, CENTER + 6);
    built(s, 'bonfire', CENTER + 8, CENTER + 9);
    built(s, 'chapel', CENTER + 11, CENTER + 9);
    s.resources = { food: 5000, wood: 500, stone: 500, iron: 0, gold: 0, wool: 0, bread: 200, clothes: 100 };
    s.morale = 80;
    return { s, h, sim: new Sim(s) };
  }

  it('com capela, pão, roupas e moral, a casa de pedra vira sobrado (só na Era II)', () => {
    const a = sobradoGame(1);
    for (let i = 0; i < TICKS_PER_HOUR * (C.upgradeHours + 2); i++) step(a.sim);
    expect(a.h.level).toBe(4);
    const b = sobradoGame(0);
    for (let i = 0; i < TICKS_PER_HOUR * (C.upgradeHours + 2); i++) step(b.sim);
    expect(b.h.level).toBe(3);
  });

  it('sobrados consomem pão e roupas; faltando, a moral cai', () => {
    const { s, h, sim } = sobradoGame(1);
    h.level = 4;
    const bread0 = s.resources.bread;
    for (let i = 0; i < TICKS_PER_HOUR * 24; i++) step(sim);
    expect(bread0 - s.resources.bread).toBeCloseTo(C.breadPerSobradoPerDay, 0);
    s.resources.bread = 0;
    for (let i = 0; i < TICKS_PER_HOUR; i++) step(sim);
    expect(s.city.lackBread).toBe(true);
    expect(moraleTarget(sim).parts.some((p) => p.label === 'Falta de pão')).toBe(true);
  });
});

describe('mercado', () => {
  it('vender barateia, comprar encarece, e o preço volta com o tempo', () => {
    const s = flatGame();
    s.era = 1;
    s.resources.stone = 1000;
    s.resources.gold = 0;
    const sim = new Sim(s);
    expect(trade(sim, 'stone', 'sell')).toMatch(/Mercado/);
    built(s, 'market', CENTER + 8, CENTER + 6);
    const p0 = lotPrice(sim, 'stone', 'sell');
    expect(trade(sim, 'stone', 'sell')).toBeNull();
    expect(s.resources.gold).toBe(p0);
    expect(s.resources.stone).toBe(900);
    expect(lotPrice(sim, 'stone', 'sell')).toBeLessThan(p0);
    for (let i = 0; i < 20; i++) recoverPrices(sim);
    expect(lotPrice(sim, 'stone', 'sell')).toBe(p0);
    s.resources.gold = 1000;
    const b0 = lotPrice(sim, 'iron', 'buy');
    expect(trade(sim, 'iron', 'buy')).toBeNull();
    expect(s.resources.iron).toBe(BALANCE.market.lot);
    expect(lotPrice(sim, 'iron', 'buy')).toBeGreaterThan(b0);
  });
});

describe('save', () => {
  it('migra saves v10 com os bens novos e o mercado', () => {
    const raw: any = {
      version: 10,
      resources: { food: 1, wood: 2, stone: 3, iron: 4, gold: 5 },
      stats: { gathered: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 } },
      city: { starving: false, cold: false, hungerThisWinter: false, taxCarry: 0 },
      buildings: [{ id: 1, kind: 'house' }],
    };
    const m = migrate(raw);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.resources).toMatchObject({ food: 1, wool: 0, bread: 0, clothes: 0 });
    expect(m.city.lackBread).toBe(false);
    expect(m.market.stone).toBe(1);
    expect(m.buildings[0].produce).toBe(0);
  });
});

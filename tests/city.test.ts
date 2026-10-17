import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { step } from '../src/core/simulation';
import { BALANCE } from '../src/data/balance';
import { TECH_DEFS } from '../src/data/techs';
import { ticksPerDay } from '../src/core/time';
import { newBuilding, newUnit, populationCap, type GameState } from '../src/state';
import type { BuildingKind } from '../src/entities/types';
import { commandGather } from '../src/systems/commands';
import { cancelResearch, startResearch } from '../src/systems/research';
import { foodPerDay, moraleTarget, missingNeeds } from '../src/systems/city';
import { eraMilestones, isEnclosed } from '../src/systems/era';
import { resolveEvent, updateEvents } from '../src/systems/events';
import { gatherRate, farmRate } from '../src/systems/units';
import { killTitan } from '../src/systems/damage';
import { unitMaxHp } from '../src/systems/modifiers';
import { addNode, addTitan, addVillager, CENTER, flatGame, runSeconds, setNoon } from './helpers';

const HOUR = ticksPerDay() / 24;

function addBuilt(sim: Sim, kind: BuildingKind, tx: number, ty: number) {
  const b = newBuilding(sim.nextId(), kind, tx, ty, true);
  sim.state.buildings.push(b);
  sim.occupyBuilding(b);
  return b;
}

function runHours(sim: Sim, h: number) {
  for (let i = 0; i < h * HOUR; i++) step(sim);
}

// Dia d, estação s (0 primavera … 3 inverno), meio-dia.
function setSeason(s: GameState, season: number) {
  setNoon(s, season * BALANCE.time.daysPerSeason + 2);
}

describe('consumo e fome', () => {
  it('a população come todo dia', () => {
    const s = flatGame();
    for (let i = 0; i < 5; i++) addVillager(s, CENTER + 6 + i, CENTER + 6);
    setNoon(s);
    const sim = new Sim(s);
    const food0 = s.resources.food;
    runHours(sim, 24);
    expect(food0 - s.resources.food).toBeCloseTo(foodPerDay(sim), 0);
  });

  it('sem comida a cidade passa fome e a moral cai', () => {
    const s = flatGame();
    for (let i = 0; i < 5; i++) addVillager(s, CENTER + 6 + i, CENTER + 6);
    setNoon(s);
    s.resources.food = 0;
    const sim = new Sim(s);
    runHours(sim, 12);
    expect(s.city.starving).toBe(true);
    expect(s.morale).toBeLessThan(BALANCE.morale.start);
  });
});

describe('casas', () => {
  it('evolui para casa de madeira com um poço por perto, e abriga mais gente', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const house = addBuilt(sim, 'house', CENTER + 6, CENTER + 6);
    const lonely = addBuilt(sim, 'house', CENTER + 30, CENTER + 30);
    addBuilt(sim, 'well', CENTER + 9, CENTER + 6);
    const cap0 = populationCap(s);
    runHours(sim, BALANCE.city.upgradeHours + 1);
    expect(house.level).toBe(2);
    expect(lonely.level).toBe(1);
    expect(missingNeeds(sim, lonely, 2)).toContain('água (poço por perto)');
    expect(populationCap(s)).toBe(cap0 + BALANCE.city.houseHousing[1] - BALANCE.city.houseHousing[0]);
  });

  it('vira casa de pedra com fogueira, moral alta e pedra (que é gasta)', () => {
    const s = flatGame();
    setNoon(s);
    s.morale = 70;
    s.resources.stone = 100;
    const sim = new Sim(s);
    const house = addBuilt(sim, 'house', CENTER + 6, CENTER + 6);
    addBuilt(sim, 'well', CENTER + 9, CENTER + 6);
    addBuilt(sim, 'bonfire', CENTER + 6, CENTER + 9);
    runHours(sim, BALANCE.city.upgradeHours * 2 + 2);
    expect(house.level).toBe(3);
    expect(s.resources.stone).toBe(100 - BALANCE.city.level3StoneCost);
  });

  it('regride se perder a água', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const house = addBuilt(sim, 'house', CENTER + 6, CENTER + 6);
    const well = addBuilt(sim, 'well', CENTER + 9, CENTER + 6);
    runHours(sim, BALANCE.city.upgradeHours + 1);
    expect(house.level).toBe(2);
    s.buildings.splice(s.buildings.indexOf(well), 1);
    sim.releaseBuilding(well);
    runHours(sim, BALANCE.city.downgradeHours + 1);
    expect(house.level).toBe(1);
  });

  it('casas melhores pagam impostos em ouro', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const house = addBuilt(sim, 'house', CENTER + 6, CENTER + 6);
    house.level = 3;
    house.missingHours = -9999; // não regride durante o teste
    const gold0 = s.resources.gold;
    runHours(sim, 24);
    expect(s.resources.gold - gold0).toBeGreaterThanOrEqual(BALANCE.city.houseTaxPerDay[2] - 1);
  });
});

describe('estações', () => {
  it('no inverno as fazendas param e as casas gastam lenha', () => {
    const s = flatGame();
    setSeason(s, 3);
    const sim = new Sim(s);
    expect(farmRate(sim)).toBe(0);
    addBuilt(sim, 'house', CENTER + 6, CENTER + 6);
    const wood0 = s.resources.wood;
    runHours(sim, 24);
    expect(s.resources.wood).toBeLessThan(wood0);
  });

  it('sem lenha no inverno a cidade passa frio', () => {
    const s = flatGame();
    setSeason(s, 3);
    s.resources.wood = 0;
    const sim = new Sim(s);
    addBuilt(sim, 'house', CENTER + 6, CENTER + 6);
    runHours(sim, 2);
    expect(s.city.cold).toBe(true);
    expect(moraleTarget(sim).parts.some((p) => p.label.startsWith('Frio'))).toBe(true);
  });

  it('o outono rende mais que a primavera', () => {
    const spring = flatGame();
    setSeason(spring, 0);
    const autumn = flatGame();
    setSeason(autumn, 2);
    expect(farmRate(new Sim(autumn))).toBeGreaterThan(farmRate(new Sim(spring)));
  });

  it('atravessar o inverno conta para as crônicas', () => {
    const s = flatGame();
    setSeason(s, 3);
    const sim = new Sim(s);
    runHours(sim, 24 * BALANCE.time.daysPerSeason);
    expect(s.stats.wintersSurvived).toBe(1);
    expect(s.relics).toContain('firstWinter');
  });
});

describe('moral', () => {
  it('moral alta faz trabalhar mais rápido', () => {
    const s = flatGame();
    const sim = new Sim(s);
    s.morale = 10;
    const slow = gatherRate(sim, 'tree');
    s.morale = 90;
    expect(gatherRate(sim, 'tree')).toBeGreaterThan(slow);
  });

  it('mortes baixam a moral por um tempo', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const before = moraleTarget(sim).target;
    addVillager(s, CENTER + 8, CENTER + 8);
    addTitan(s, CENTER + 10, CENTER + 8, 6);
    runSeconds(sim, 15);
    expect(s.stats.deaths).toBeGreaterThan(0);
    expect(moraleTarget(sim).target).toBeLessThan(before);
  });
});

describe('tecnologias', () => {
  it('pesquisa custa recursos, leva tempo e dá o bônus', () => {
    const s = flatGame();
    s.resources = { food: 1000, wood: 1000, stone: 1000, iron: 0, gold: 500 };
    const sim = new Sim(s);
    const camp = addBuilt(sim, 'lumberCamp', CENTER + 8, CENTER);
    const rate0 = gatherRate(sim, 'tree');
    expect(startResearch(sim, camp.id, 'sharpAxes')).toBeNull();
    expect(s.resources.food).toBe(1000 - TECH_DEFS.sharpAxes.cost.food!);
    runSeconds(sim, TECH_DEFS.sharpAxes.time + 1);
    expect(s.techs).toContain('sharpAxes');
    expect(gatherRate(sim, 'tree')).toBeCloseTo(rate0 * 1.2, 5);
  });

  it('exige o edifício certo e os pré-requisitos', () => {
    const s = flatGame();
    s.resources = { food: 1000, wood: 1000, stone: 1000, iron: 0, gold: 500 };
    const sim = new Sim(s);
    const mill = addBuilt(sim, 'mill', CENTER + 8, CENTER);
    expect(startResearch(sim, s.buildings[0].id, 'sharpAxes')).toMatch(/indisponível/);
    expect(startResearch(sim, mill.id, 'cropRotation')).toMatch(/indisponível/);
    expect(startResearch(sim, mill.id, 'woodenPlow')).toBeNull();
  });

  it('cancelar devolve os recursos', () => {
    const s = flatGame();
    s.resources = { food: 1000, wood: 1000, stone: 1000, iron: 0, gold: 500 };
    const sim = new Sim(s);
    expect(startResearch(sim, s.buildings[0].id, 'wickerBaskets')).toBeNull();
    cancelResearch(sim, s.buildings[0].id);
    expect(s.resources.food).toBe(1000);
  });

  it('Treino de Milícia fortalece também os milicianos que já existem', () => {
    const s = flatGame();
    s.resources = { food: 1000, wood: 1000, stone: 1000, iron: 0, gold: 500 };
    const m = newUnit(s.nextId++, 'militia', 'Otto Bauer', CENTER * 32, (CENTER + 6) * 32);
    s.units.push(m);
    const sim = new Sim(s);
    startResearch(sim, s.buildings[0].id, 'militiaDrill');
    runSeconds(sim, TECH_DEFS.militiaDrill.time + 1);
    expect(m.hp).toBe(unitMaxHp(s, m));
    expect(m.hp).toBe(80);
  });
});

describe('crônicas e Grandes Ataques', () => {
  it('abater o primeiro titã cumpre "Primeiro Sangue"', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const t = addTitan(s, CENTER + 30, CENTER, 3);
    killTitan(sim, t);
    runHours(sim, 1);
    expect(s.relics).toContain('firstBlood');
  });

  it('a horda é repelida quando todos os seus titãs caem (sem mortes = perfeita)', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const t1 = addTitan(s, CENTER + 40, CENTER, 3);
    const t2 = addTitan(s, CENTER - 40, CENTER, 3);
    t1.horde = t2.horde = true;
    s.stats.hordeDeathsAtStart = s.stats.deaths;
    killTitan(sim, t1);
    runHours(sim, 1);
    expect(s.stats.greatAttacksRepelled).toBe(0);
    killTitan(sim, t2);
    runHours(sim, 1);
    expect(s.stats.greatAttacksRepelled).toBe(1);
    expect(s.stats.flawlessHordes).toBe(1);
  });
});

describe('marcos de era', () => {
  it('detecta se a vila está cercada (portão conta como fechado)', () => {
    const s = flatGame();
    const sim = new Sim(s);
    expect(isEnclosed(sim)).toBe(false);
    const r = 5;
    const walls = [];
    for (let x = CENTER - r; x <= CENTER + r; x++) {
      for (let y = CENTER - r; y <= CENTER + r; y++) {
        if (x === CENTER - r || x === CENTER + r || y === CENTER - r || y === CENTER + r) walls.push(addBuilt(sim, 'palisade', x, y));
      }
    }
    const sim2 = new Sim(s);
    expect(isEnclosed(sim2)).toBe(true);
    // Abre um buraco: não está mais cercada.
    const gap = walls[3];
    s.buildings.splice(s.buildings.indexOf(gap), 1);
    expect(isEnclosed(new Sim(s))).toBe(false);
    // Um portão fecha de novo.
    const sim3 = new Sim(s);
    addBuilt(sim3, 'gate', gap.tx, gap.ty);
    expect(isEnclosed(sim3)).toBe(true);
  });

  it('lista os marcos com progresso', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const m = eraMilestones(sim);
    expect(m.length).toBeGreaterThanOrEqual(7);
    expect(m.every((x) => typeof x.progress === 'string')).toBe(true);
    expect(m[0].done).toBe(false);
  });
});

describe('eventos', () => {
  it('surge um evento pela manhã e a escolha tem efeito', () => {
    const s = flatGame();
    setNoon(s, 5);
    s.events.nextDay = 1;
    s.resources.food = 500;
    const sim = new Sim(s);
    // Avança até as 7h do dia seguinte.
    for (let i = 0; i < ticksPerDay() && !s.events.active; i++) {
      step(sim);
      updateEvents(sim);
    }
    expect(s.events.active).not.toBeNull();
    // Força o evento dos refugiados para conferir o efeito.
    s.events.active = { id: 'refugees', data: { n: 3 } };
    const units0 = s.units.length;
    expect(resolveEvent(sim, 0)).toMatch(/acolhidos/);
    expect(s.units.length).toBe(units0 + 3);
    expect(s.events.active).toBeNull();
  });

  it('opção sem recursos não pode ser escolhida', () => {
    const s = flatGame();
    s.resources.food = 0;
    const sim = new Sim(s);
    s.events.active = { id: 'refugees', data: { n: 3 } };
    expect(resolveEvent(sim, 0)).toBeNull();
    expect(s.events.active).not.toBeNull();
  });
});

describe('coleta registrada', () => {
  it('o que é entregue entra nas estatísticas', () => {
    const s = flatGame();
    const tree = addNode(s, 'tree', CENTER + 6, CENTER, 100);
    const u = addVillager(s, CENTER + 3, CENTER + 3);
    const sim = new Sim(s);
    commandGather(sim, [u.id], tree.id);
    runSeconds(sim, 60);
    expect(s.stats.gathered.wood).toBeGreaterThan(0);
  });
});

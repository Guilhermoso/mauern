import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { BALANCE } from '../src/data/balance';
import { MAX_LEVEL, rankName, xpToNext } from '../src/data/ranks';
import { newBuilding, newUnit, type GameState } from '../src/state';
import type { UnitKind } from '../src/entities/types';
import { gainXp, setTrainer, trainees, trainingRate, commandTrain, dismissTraining } from '../src/systems/soldiers';
import {
  battalionCapacity,
  battalionCommand,
  battalionOf,
  disbandBattalion,
  formBattalion,
  setCommander,
  setMode,
} from '../src/systems/battalions';
import { unitAttack, unitMaxHp } from '../src/systems/modifiers';
import { commandAttack } from '../src/systems/commands';
import { addTitan, CENTER, flatGame, runSeconds, setNoon } from './helpers';

const TS = BALANCE.world.tileSize;

function soldier(s: GameState, tx: number, ty: number, level = 1, kind: UnitKind = 'militia') {
  const u = newUnit(s.nextId++, kind, `Soldado ${s.nextId}`, (tx + 0.5) * TS, (ty + 0.5) * TS);
  u.level = level;
  u.hp = 9999;
  s.units.push(u);
  return u;
}

describe('patentes e experiência', () => {
  it('há 100 patentes diferentes, de Recruta I a Comandante Supremo V', () => {
    const names = new Set(Array.from({ length: MAX_LEVEL }, (_, i) => rankName(i + 1)));
    expect(names.size).toBe(100);
    expect(rankName(1)).toBe('Recruta I');
    expect(rankName(18)).toBe('Cabo III');
    expect(rankName(100)).toBe('Comandante Supremo V');
  });

  it('a experiência para subir de nível sempre aumenta', () => {
    for (let l = 1; l < MAX_LEVEL; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });

  it('ganhar experiência sobe vários níveis e o nível máximo é 100', () => {
    const s = flatGame();
    const u = soldier(s, CENTER + 5, CENTER + 5);
    const sim = new Sim(s);
    gainXp(sim, u, xpToNext(1) + xpToNext(2) + 1);
    expect(u.level).toBe(3);
    gainXp(sim, u, 1e9);
    expect(u.level).toBe(MAX_LEVEL);
    expect(u.xp).toBe(0);
  });

  it('aldeões não ganham experiência', () => {
    const s = flatGame();
    const v = newUnit(s.nextId++, 'villager', 'Anna Bauer', CENTER * TS, CENTER * TS);
    s.units.push(v);
    gainXp(new Sim(s), v, 5000);
    expect(v.level).toBe(1);
  });

  it('nível maior = mais vida e mais ataque', () => {
    const s = flatGame();
    const a = soldier(s, CENTER + 5, CENTER + 5, 1);
    const b = soldier(s, CENTER + 6, CENTER + 5, 50);
    expect(unitMaxHp(s, b)).toBeGreaterThan(unitMaxHp(s, a));
    expect(unitAttack(s, b)).toBeGreaterThan(unitAttack(s, a) * 2);
  });

  it('golpear e abater titãs dá experiência', () => {
    const s = flatGame();
    setNoon(s);
    s.buildings = [];
    const t = addTitan(s, CENTER + 4, CENTER, 3);
    const ms = [0, 1, 2].map((i) => soldier(s, CENTER, CENTER + i));
    const sim = new Sim(s);
    commandAttack(sim, ms.map((m) => m.id), t.id);
    runSeconds(sim, 60);
    expect(s.titans).toHaveLength(0);
    expect(ms.some((m) => m.level > 1)).toBe(true);
  });
});

describe('campo de treinamento', () => {
  function field(s: GameState, sim: Sim) {
    const f = newBuilding(sim.nextId(), 'trainingGround', CENTER + 8, CENTER + 8, true);
    s.buildings.push(f);
    sim.occupyBuilding(f);
    return f;
  }

  it('sem treinador ninguém treina; com treinador os alunos e o treinador ganham experiência', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const f = field(s, sim);
    const coach = soldier(s, CENTER + 6, CENTER + 6, 20);
    const students = [0, 1, 2].map((i) => soldier(s, CENTER + 5, CENTER + 6 + i, 1));
    commandTrain(sim, [coach.id, ...students.map((u) => u.id)], f.id);
    runSeconds(sim, 20);
    expect(students.every((u) => u.level === 1 && u.xp === 0)).toBe(true);
    expect(setTrainer(sim, f.id, coach.id)).toBeNull();
    const coachXp0 = coach.xp + coach.level * 1e6;
    runSeconds(sim, 60);
    expect(students.every((u) => u.level > 1)).toBe(true);
    expect(coach.xp + coach.level * 1e6).toBeGreaterThan(coachXp0);
  });

  it('treinador de nível maior ensina mais rápido', () => {
    const s = flatGame();
    const student = soldier(s, CENTER, CENTER, 1);
    const weak = soldier(s, CENTER, CENTER, 5);
    const strong = soldier(s, CENTER, CENTER, 60);
    expect(trainingRate(strong, student)).toBeGreaterThan(trainingRate(weak, student) * 2);
  });

  it('aluno que já alcançou o treinador aprende bem mais devagar', () => {
    const s = flatGame();
    const coach = soldier(s, CENTER, CENTER, 10);
    expect(trainingRate(coach, soldier(s, CENTER, CENTER, 12))).toBeLessThan(trainingRate(coach, soldier(s, CENTER, CENTER, 9)) * 0.5);
  });

  it('respeita a capacidade do campo e dispensa todos', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const f = field(s, sim);
    const many = Array.from({ length: 15 }, (_, i) => soldier(s, CENTER + 2 + (i % 5), CENTER - 6 - Math.floor(i / 5)));
    commandTrain(sim, many.map((u) => u.id), f.id);
    expect(trainees(sim, f)).toHaveLength(BALANCE.soldiers.trainingCapacity + 1);
    dismissTraining(sim, f.id);
    expect(trainees(sim, f)).toHaveLength(0);
  });
});

describe('batalhões', () => {
  it('o comandante é o de maior nível e o tamanho depende do nível dele', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const units = Array.from({ length: 10 }, (_, i) => soldier(s, CENTER + 5 + (i % 5), CENTER + 5 + Math.floor(i / 5), i === 7 ? 8 : 1));
    const { battalion, leftOut } = formBattalion(sim, units.map((u) => u.id));
    expect(battalion!.commanderId).toBe(units[7].id);
    expect(battalion!.memberIds).toHaveLength(battalionCapacity(8));
    expect(leftOut).toBe(9 - battalionCapacity(8));
    expect(battalionCapacity(100)).toBeGreaterThan(battalionCapacity(1));
  });

  it('o batalhão anda junto, em formação', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const units = [soldier(s, CENTER + 5, CENTER + 5, 10), ...[1, 2, 3].map((i) => soldier(s, CENTER + 5 + i, CENTER + 5))];
    const { battalion } = formBattalion(sim, units.map((u) => u.id));
    battalionCommand(sim, battalion!.id, (CENTER + 25.5) * TS, (CENTER + 5.5) * TS);
    runSeconds(sim, 30);
    for (const u of units) expect(Math.hypot(u.x / TS - (CENTER + 25), u.y / TS - (CENTER + 5))).toBeLessThan(4);
  });

  it('desfazer o batalhão devolve soldados avulsos', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const units = [1, 2, 3].map((i) => soldier(s, CENTER + 5 + i, CENTER + 5));
    const { battalion } = formBattalion(sim, units.map((u) => u.id));
    disbandBattalion(sim, battalion!.id);
    expect(s.battalions).toHaveLength(0);
    expect(units.every((u) => u.battalion === 0 && u.order.type === 'idle')).toBe(true);
  });

  it('se o comandante cai, o de maior nível assume', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const c = soldier(s, CENTER + 5, CENTER + 5, 10);
    const second = soldier(s, CENTER + 6, CENTER + 5, 6);
    const third = soldier(s, CENTER + 7, CENTER + 5, 2);
    const { battalion } = formBattalion(sim, [c.id, second.id, third.id]);
    s.units.splice(s.units.indexOf(c), 1);
    runSeconds(sim, 0.1);
    expect(battalionOf(sim, battalion!.id)!.commanderId).toBe(second.id);
  });

  it('trocar para um comandante de nível menor libera quem não cabe', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const c = soldier(s, CENTER + 5, CENTER + 5, 12);
    const rookies = Array.from({ length: battalionCapacity(12) }, (_, i) => soldier(s, CENTER + 6 + i, CENTER + 5, 1));
    const { battalion } = formBattalion(sim, [c.id, ...rookies.map((u) => u.id)]);
    setCommander(sim, battalion!.id, rookies[0].id);
    const b = battalionOf(sim, battalion!.id)!;
    expect(b.memberIds.length).toBe(battalionCapacity(1));
  });

  it('no modo defender, ataca titãs que chegam perto do ponto', () => {
    const s = flatGame();
    setNoon(s);
    const sim = new Sim(s);
    const units = [soldier(s, CENTER + 10, CENTER + 10, 10), soldier(s, CENTER + 11, CENTER + 10, 5)];
    const { battalion } = formBattalion(sim, units.map((u) => u.id));
    setMode(sim, battalion!.id, 'defend');
    addTitan(s, CENTER + 22, CENTER + 10, 3).attackCooldown = 999;
    runSeconds(sim, 1);
    expect(battalionOf(sim, battalion!.id)!.order.type).toBe('attack');
  });

  it('no modo caçar, vai atrás de titãs longe', () => {
    const s = flatGame();
    setNoon(s);
    s.buildings = [];
    const sim = new Sim(s);
    const units = [soldier(s, CENTER, CENTER, 10), soldier(s, CENTER + 1, CENTER, 5)];
    const { battalion } = formBattalion(sim, units.map((u) => u.id));
    const t = addTitan(s, CENTER + 60, CENTER, 3);
    t.attackCooldown = 999;
    setMode(sim, battalion!.id, 'hunt');
    const d0 = Math.hypot(units[0].x - t.x, units[0].y - t.y);
    runSeconds(sim, 10);
    expect(battalionOf(sim, battalion!.id)!.order.type).toBe('attack');
    expect(Math.hypot(units[0].x - t.x, units[0].y - t.y)).toBeLessThan(d0);
  });

  it('soldados de batalhão não vão treinar', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const f = newBuilding(sim.nextId(), 'trainingGround', CENTER + 8, CENTER + 8, true);
    s.buildings.push(f);
    sim.occupyBuilding(f);
    const units = [soldier(s, CENTER + 5, CENTER + 5), soldier(s, CENTER + 6, CENTER + 5)];
    formBattalion(sim, units.map((u) => u.id));
    expect(commandTrain(sim, units.map((u) => u.id), f.id)).toMatch(/batalhão/);
  });
});

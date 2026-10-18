import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { BALANCE } from '../src/data/balance';
import { UNIT_DEFS } from '../src/data/defs';
import { newBuilding, newUnit } from '../src/state';
import { cancelTrain, commandGarrison, commandGather, trainUnit } from '../src/systems/commands';
import { batchTime } from '../src/systems/production';
import { dismissGuard, guardOf, releaseShelter } from '../src/systems/refuge';
import { addNode, addTitan, addVillager, CENTER, flatGame, runSeconds, setNoon } from './helpers';
import type { GameState } from '../src/state';

const TS = BALANCE.world.tileSize;

function rich(s: GameState) {
  s.resources = { food: 5000, wood: 5000, stone: 5000, iron: 0, gold: 500, wool: 0, bread: 0, clothes: 0 };
}

describe('treino em lotes', () => {
  it('militares entram no mesmo lote, até 3', () => {
    const s = flatGame();
    rich(s);
    const sim = new Sim(s);
    const tc = s.buildings[0];
    for (let i = 0; i < 4; i++) trainUnit(sim, tc.id, 'militia');
    expect(tc.queue.map((q) => q.count)).toEqual([3, 1]);
  });

  it('cliques seguidos somam ao lote mesmo depois de começar, sem perder o progresso', () => {
    const s = flatGame();
    rich(s);
    for (let i = 0; i < 3; i++) s.buildings.push(newBuilding(s.nextId++, 'house', CENTER + 10 + i * 3, CENTER + 10, true));
    const sim = new Sim(s);
    const tc = s.buildings[0];
    trainUnit(sim, tc.id, 'militia');
    runSeconds(sim, 5);
    const p = tc.queue[0].progress;
    trainUnit(sim, tc.id, 'militia');
    expect(tc.queue).toHaveLength(1);
    expect(tc.queue[0].count).toBe(2);
    expect(tc.queue[0].progress).toBe(p);
  });

  it('Shift enfileira um lote cheio de uma vez', () => {
    const s = flatGame();
    rich(s);
    const sim = new Sim(s);
    const tc = s.buildings[0];
    trainUnit(sim, tc.id, 'militia', true);
    expect(tc.queue).toHaveLength(1);
    expect(tc.queue[0].count).toBe(BALANCE.units.maxBatch);
  });

  it('aldeões não formam lotes', () => {
    const s = flatGame();
    rich(s);
    const sim = new Sim(s);
    const tc = s.buildings[0];
    trainUnit(sim, tc.id, 'villager');
    trainUnit(sim, tc.id, 'villager');
    expect(tc.queue.map((q) => q.count)).toEqual([1, 1]);
  });

  it('o lote sai junto e leva menos que treinar um por um', () => {
    const s = flatGame();
    rich(s);
    for (let i = 0; i < 3; i++) s.buildings.push(newBuilding(s.nextId++, 'house', CENTER + 10 + i * 3, CENTER + 10, true));
    const sim = new Sim(s);
    const tc = s.buildings[0];
    trainUnit(sim, tc.id, 'militia', true);
    const t = batchTime('militia', 3);
    expect(t).toBeLessThan(UNIT_DEFS.militia.trainTime * 3);
    runSeconds(sim, t - 1);
    expect(s.units.filter((u) => u.kind === 'militia')).toHaveLength(0);
    runSeconds(sim, 2);
    expect(s.units.filter((u) => u.kind === 'militia')).toHaveLength(3);
  });

  it('o lote espera moradia para todos', () => {
    const s = flatGame();
    rich(s);
    for (let i = 0; i < 3; i++) addVillager(s, CENTER + 6 + i, CENTER + 6); // 3/5
    const sim = new Sim(s);
    const tc = s.buildings[0];
    trainUnit(sim, tc.id, 'militia', true);
    runSeconds(sim, batchTime('militia', 3) + 5);
    expect(s.units.filter((u) => u.kind === 'militia')).toHaveLength(0);
  });

  it('cancelar tira uma unidade do lote e devolve o custo dela', () => {
    const s = flatGame();
    rich(s);
    const sim = new Sim(s);
    const tc = s.buildings[0];
    trainUnit(sim, tc.id, 'militia', true);
    const food = s.resources.food;
    cancelTrain(sim, tc.id, 0);
    expect(tc.queue[0].count).toBe(2);
    expect(s.resources.food).toBe(food + UNIT_DEFS.militia.cost.food!);
  });
});

describe('fuga e Campo de Refúgio', () => {
  // setup: cria recursos antes da simulação (ela indexa os recursos ao iniciar).
  function withRefuge(setup?: (s: GameState) => void) {
    const s = flatGame();
    setNoon(s);
    setup?.(s);
    const refuge = newBuilding(s.nextId++, 'refuge', CENTER - 8, CENTER + 6, true);
    s.buildings.push(refuge);
    const sim = new Sim(s);
    return { s, sim, refuge };
  }

  it('aldeão trabalhando foge de um titã para o refúgio e fica aterrorizado', () => {
    let tree!: ReturnType<typeof addNode>;
    const { s, sim, refuge } = withRefuge((st) => (tree = addNode(st, 'tree', CENTER + 12, CENTER + 6)));
    const u = addVillager(s, CENTER + 11, CENTER + 6);
    commandGather(sim, [u.id], tree.id);
    runSeconds(sim, 2);
    addTitan(s, CENTER + 17, CENTER + 6, 4).attackCooldown = 999;
    runSeconds(sim, 1);
    expect(u.order.type).toBe('flee');
    expect(u.terror).toBeGreaterThan(0);
    runSeconds(sim, 25);
    expect(u.garrison).toBe(refuge.id);
    expect(s.units.includes(u)).toBe(true);
  });

  it('aterrorizados não saem; depois do terror, saem ou voltam ao trabalho', () => {
    let tree!: ReturnType<typeof addNode>;
    const { s, sim, refuge } = withRefuge((st) => (tree = addNode(st, 'tree', CENTER - 3, CENTER + 12)));
    const a = addVillager(s, CENTER - 4, CENTER + 12);
    const b = addVillager(s, CENTER - 4, CENTER + 13);
    commandGather(sim, [a.id, b.id], tree.id);
    runSeconds(sim, 2);
    const t = addTitan(s, CENTER + 2, CENTER + 12, 4);
    t.attackCooldown = 999;
    runSeconds(sim, 12);
    expect(a.garrison).toBe(refuge.id);
    s.titans = [];
    expect(releaseShelter(sim, refuge.id, true)).toBe(0); // ainda aterrorizados
    runSeconds(sim, BALANCE.refuge.terrorSeconds + 1);
    expect(a.terror).toBe(0);
    expect(a.garrison).toBe(refuge.id); // continuam lá até o jogador tirar
    a.terror = 0;
    // Um sai à toa, o outro volta ao trabalho.
    b.terror = 5;
    expect(releaseShelter(sim, refuge.id, true)).toBe(1);
    expect(a.order.type).toBe('gather');
    runSeconds(sim, 6);
    expect(releaseShelter(sim, refuge.id, false)).toBe(1);
    expect(b.order.type).toBe('idle');
  });

  it('um guarda de nível alto acalma o terror mais rápido', () => {
    const run = (guardLevel: number) => {
      const { s, sim, refuge } = withRefuge();
      const u = addVillager(s, CENTER, CENTER + 10);
      u.garrison = refuge.id;
      u.terror = 50;
      if (guardLevel) {
        const g = newUnit(s.nextId++, 'militia', 'Otto Bauer', (CENTER - 6) * TS, (CENTER + 10) * TS);
        g.level = guardLevel;
        s.units.push(g);
        commandGarrison(sim, [g.id], refuge.id);
        runSeconds(sim, 8);
        expect(guardOf(sim, refuge)?.id).toBe(g.id);
        u.terror = 50;
      }
      runSeconds(sim, 10);
      return u.terror;
    };
    expect(run(40)).toBeLessThan(run(0) - 10);
  });

  it('o guarda fica no posto ao liberar os aldeões e pode ser dispensado', () => {
    const { s, sim, refuge } = withRefuge();
    const g = newUnit(s.nextId++, 'militia', 'Otto Bauer', (CENTER - 6) * TS, (CENTER + 10) * TS);
    s.units.push(g);
    commandGarrison(sim, [g.id], refuge.id);
    runSeconds(sim, 8);
    releaseShelter(sim, refuge.id, false);
    expect(g.garrison).toBe(refuge.id);
    dismissGuard(sim, refuge.id);
    expect(g.garrison).toBe(0);
    expect(refuge.guardId).toBe(0);
  });

  it('sem abrigo com vaga, o aldeão corre para longe e depois volta sozinho ao trabalho', () => {
    const s = flatGame();
    setNoon(s);
    s.buildings = []; // sem Centro da Vila nem refúgio
    const tree = addNode(s, 'tree', CENTER + 1, CENTER);
    const u = addVillager(s, CENTER, CENTER);
    const sim = new Sim(s);
    commandGather(sim, [u.id], tree.id);
    runSeconds(sim, 1);
    const t = addTitan(s, CENTER + 6, CENTER, 4);
    runSeconds(sim, 1);
    expect(u.order.type).toBe('flee');
    s.titans.splice(s.titans.indexOf(t), 1);
    runSeconds(sim, BALANCE.refuge.terrorSeconds + 15);
    expect(u.order.type).toBe('gather');
  });
});

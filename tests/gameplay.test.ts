import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { populationCap } from '../src/state';
import { BUILDING_DEFS, UNIT_DEFS } from '../src/data/defs';
import {
  cancelTrain,
  canPlace,
  commandGather,
  commandMove,
  deleteEntity,
  placeBuilding,
  setRally,
  trainUnit,
} from '../src/systems/commands';
import { addNode, addVillager, CENTER, flatGame, runSeconds } from './helpers';

describe('movimento', () => {
  it('a unidade anda até o destino e fica ociosa', () => {
    const s = flatGame();
    const u = addVillager(s, CENTER + 4, CENTER + 4);
    const sim = new Sim(s);
    commandMove(sim, [u.id], CENTER + 14, CENTER + 4);
    runSeconds(sim, 15);
    expect(Math.floor(u.x / 32)).toBe(CENTER + 14);
    expect(u.order.type).toBe('idle');
  });

  it('grupos se espalham em tiles diferentes', () => {
    const s = flatGame();
    const a = addVillager(s, CENTER + 4, CENTER + 4);
    const b = addVillager(s, CENTER + 5, CENTER + 4);
    const c = addVillager(s, CENTER + 6, CENTER + 4);
    const sim = new Sim(s);
    commandMove(sim, [a.id, b.id, c.id], CENTER + 10, CENTER + 10);
    const targets = [a, b, c].map((u) => (u.order.type === 'move' ? `${u.order.tx},${u.order.ty}` : ''));
    expect(new Set(targets).size).toBe(3);
  });
});

describe('coleta', () => {
  it('o aldeão corta madeira e entrega no Centro da Vila', () => {
    const s = flatGame();
    const tree = addNode(s, 'tree', CENTER + 6, CENTER, 100);
    const u = addVillager(s, CENTER + 3, CENTER + 3);
    const sim = new Sim(s);
    const wood0 = s.resources.wood;
    expect(commandGather(sim, [u.id], tree.id)).toBeNull();
    runSeconds(sim, 60);
    expect(s.resources.wood).toBeGreaterThan(wood0);
    expect(tree.amount).toBeLessThan(100);
    expect(u.order.type).toBe('gather');
  });

  it('quando o recurso acaba, procura outro igual por perto', () => {
    const s = flatGame();
    const t1 = addNode(s, 'tree', CENTER + 6, CENTER, 3);
    const t2 = addNode(s, 'tree', CENTER + 7, CENTER + 2, 100);
    const u = addVillager(s, CENTER + 3, CENTER + 3);
    const sim = new Sim(s);
    commandGather(sim, [u.id], t1.id);
    runSeconds(sim, 40);
    expect(sim.node(t1.id)).toBeUndefined();
    expect(t2.amount).toBeLessThan(100);
    // O tile da árvore esgotada fica livre.
    expect(sim.nav.isFree(t1.tx, t1.ty)).toBe(true);
    expect(sim.terrainChanges.length).toBeGreaterThan(0);
  });

  it('cristais ainda não podem ser coletados', () => {
    const s = flatGame();
    const c = addNode(s, 'crystal', CENTER + 6, CENTER);
    const u = addVillager(s, CENTER + 3, CENTER + 3);
    const sim = new Sim(s);
    expect(commandGather(sim, [u.id], c.id)).toMatch(/cristais/);
  });
});

describe('construção', () => {
  it('constrói uma casa e aumenta o limite de população', () => {
    const s = flatGame();
    const u = addVillager(s, CENTER + 3, CENTER + 3);
    const sim = new Sim(s);
    const cap0 = populationCap(s);
    const wood0 = s.resources.wood;
    const { building, error } = placeBuilding(sim, 'house', CENTER + 5, CENTER + 5, [u.id]);
    expect(error).toBeUndefined();
    expect(s.resources.wood).toBe(wood0 - 30);
    expect(populationCap(s)).toBe(cap0); // ainda não terminou
    runSeconds(sim, BUILDING_DEFS.house.buildTime + 10);
    expect(building!.built).toBe(true);
    expect(populationCap(s)).toBe(cap0 + 5);
    expect(u.order.type).toBe('idle');
  });

  it('não deixa construir sobre recursos, edifícios ou água, nem sem recursos', () => {
    const s = flatGame();
    addNode(s, 'tree', CENTER + 10, CENTER + 10);
    const sim = new Sim(s);
    expect(canPlace(sim, 'house', CENTER + 9, CENTER + 9)).toMatch(/recursos/);
    expect(canPlace(sim, 'house', CENTER - 1, CENTER - 1)).toMatch(/construção/);
    s.world.tiles[(CENTER + 20) * s.world.width + CENTER + 20] = 3; // água
    expect(canPlace(sim, 'house', CENTER + 20, CENTER + 20)).toMatch(/Terreno/);
    s.resources.wood = 10;
    expect(placeBuilding(sim, 'house', CENTER + 5, CENTER + 5, []).error).toMatch(/insuficientes/);
  });

  it('ao terminar um depósito de madeira, o construtor vai cortar árvores por perto', () => {
    const s = flatGame();
    s.resources.wood = 500;
    addNode(s, 'tree', CENTER + 12, CENTER);
    const u = addVillager(s, CENTER + 6, CENTER + 2);
    const sim = new Sim(s);
    placeBuilding(sim, 'lumberCamp', CENTER + 9, CENTER, [u.id]);
    runSeconds(sim, BUILDING_DEFS.lumberCamp.buildTime + 8);
    expect(u.order.type).toBe('gather');
  });

  it('demolir uma construção inacabada devolve os recursos', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const wood0 = s.resources.wood;
    const { building } = placeBuilding(sim, 'house', CENTER + 5, CENTER + 5, []);
    deleteEntity(sim, building!.id);
    expect(s.resources.wood).toBe(wood0);
    expect(sim.nav.isFree(CENTER + 5, CENTER + 5)).toBe(true);
  });

  it('a fazenda produz comida sem se esgotar', () => {
    const s = flatGame();
    const u = addVillager(s, CENTER + 3, CENTER + 3);
    const sim = new Sim(s);
    const { building } = placeBuilding(sim, 'farm', CENTER + 4, CENTER - 1, [u.id]);
    runSeconds(sim, BUILDING_DEFS.farm.buildTime + 5);
    expect(building!.built).toBe(true);
    expect(u.order.type).toBe('farm');
    const food0 = s.resources.food;
    runSeconds(sim, 90);
    expect(s.resources.food).toBeGreaterThan(food0);
  });
});

describe('treino', () => {
  it('o Centro da Vila treina aldeões e cobra comida', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const tc = s.buildings[0];
    const food0 = s.resources.food;
    expect(trainUnit(sim, tc.id, 'villager')).toBeNull();
    expect(s.resources.food).toBe(food0 - 50);
    runSeconds(sim, UNIT_DEFS.villager.trainTime + 1);
    expect(s.units).toHaveLength(1);
    expect(s.units[0].kind).toBe('villager');
  });

  it('o treino espera quando falta moradia', () => {
    const s = flatGame();
    for (let i = 0; i < 5; i++) addVillager(s, CENTER + 6 + i, CENTER + 6);
    const sim = new Sim(s);
    trainUnit(sim, s.buildings[0].id, 'villager');
    runSeconds(sim, UNIT_DEFS.villager.trainTime + 5);
    expect(s.units).toHaveLength(5);
    expect(s.buildings[0].queue).toHaveLength(1);
  });

  it('cancelar o treino devolve os recursos', () => {
    const s = flatGame();
    const sim = new Sim(s);
    const food0 = s.resources.food;
    trainUnit(sim, s.buildings[0].id, 'villager');
    cancelTrain(sim, s.buildings[0].id, 0);
    expect(s.resources.food).toBe(food0);
  });

  it('o novo aldeão vai coletar o recurso do ponto de reunião', () => {
    const s = flatGame();
    const berries = addNode(s, 'berries', CENTER + 6, CENTER);
    const sim = new Sim(s);
    setRally(sim, s.buildings[0].id, berries.tx, berries.ty);
    trainUnit(sim, s.buildings[0].id, 'villager');
    runSeconds(sim, UNIT_DEFS.villager.trainTime + 1);
    expect(s.units[0].order.type).toBe('gather');
  });

  it('recusa o treino sem recursos suficientes', () => {
    const s = flatGame();
    s.resources.food = 10;
    const sim = new Sim(s);
    expect(trainUnit(sim, s.buildings[0].id, 'villager')).toMatch(/insuficientes/);
  });
});

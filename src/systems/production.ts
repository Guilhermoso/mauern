import { BALANCE } from '../data/balance';
import { findNearestNode, gathererCounts, nodeHasRoom } from './queries';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { newUnit, populationCap } from '../state';
import { randomName } from '../entities/names';
import type { Building, Unit } from '../entities/types';
import { setOrder } from './units';
import { unitMaxHp } from './modifiers';

const DT = 1 / BALANCE.time.ticksPerSecond;

// Tempo de um lote: a primeira unidade custa o tempo cheio, cada extra uma fração.
export function batchTime(kind: Unit['kind'], count: number): number {
  return UNIT_DEFS[kind].trainTime * (1 + (count - 1) * BALANCE.units.batchExtraTime);
}

// Avança as filas de treino dos edifícios. Um lote só avança se houver moradia para todo ele.
export function updateProduction(sim: Sim): void {
  for (const b of sim.state.buildings) {
    if (!b.built || b.queue.length === 0) continue;
    const item = b.queue[0];
    if (sim.state.units.length + item.count > populationCap(sim.state)) continue;
    item.progress += DT;
    if (item.progress >= batchTime(item.kind, item.count)) {
      b.queue.shift();
      for (let i = 0; i < item.count; i++) spawnUnit(sim, b, item.kind);
    }
  }
}

function spawnUnit(sim: Sim, b: Building, kind: Unit['kind']): Unit {
  const ts = sim.tileSize;
  const size = BUILDING_DEFS[b.kind].size;
  // Sai pelo lado do edifício mais próximo do ponto de reunião (ou por baixo).
  const target = b.rally ?? { tx: b.tx + size / 2, ty: b.ty + size + 2 };
  let best = { x: b.tx, y: b.ty + size };
  let bestD = Infinity;
  for (let y = b.ty - 1; y <= b.ty + size; y++) {
    for (let x = b.tx - 1; x <= b.tx + size; x++) {
      const border = x === b.tx - 1 || y === b.ty - 1 || x === b.tx + size || y === b.ty + size;
      if (!border || !sim.nav.isFree(x, y)) continue;
      const d = (x - target.tx) ** 2 + (y - target.ty) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  const u = newUnit(sim.nextId(), kind, randomName(sim.rng), (best.x + 0.5) * ts, (best.y + 0.5) * ts);
  u.hp = unitMaxHp(sim.state, u);
  sim.state.units.push(u);

  if (b.rally) {
    let node = b.rally.nodeId !== undefined ? sim.node(b.rally.nodeId) : undefined;
    // Ponto de reunião num recurso lotado: vai ao igual mais próximo com vaga.
    if (node && !nodeHasRoom(sim, node, u.id)) {
      node = findNearestNode(sim, node.kind, node.tx, node.ty, BALANCE.units.nodeSearchRadius, [], gathererCounts(sim, u.id)) ?? node;
    }
    if (node && UNIT_DEFS[kind].canGather) {
      setOrder(u, { type: 'gather', nodeId: node.id, nodeKind: node.kind, tx: node.tx, ty: node.ty, phase: 'collect', avoid: [] });
    } else {
      setOrder(u, { type: 'move', tx: b.rally.tx, ty: b.rally.ty });
    }
  }
  return u;
}

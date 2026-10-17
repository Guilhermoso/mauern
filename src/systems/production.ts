import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { newUnit, populationCap } from '../state';
import { randomName } from '../entities/names';
import type { Building, Unit } from '../entities/types';
import { setOrder } from './units';
import { unitMaxHp } from './modifiers';

const DT = 1 / BALANCE.time.ticksPerSecond;

// Avança as filas de treino dos edifícios. O treino pausa se não houver moradia.
export function updateProduction(sim: Sim): void {
  for (const b of sim.state.buildings) {
    if (!b.built || b.queue.length === 0) continue;
    const item = b.queue[0];
    if (sim.state.units.length >= populationCap(sim.state)) continue;
    item.progress += DT;
    if (item.progress >= UNIT_DEFS[item.kind].trainTime) {
      b.queue.shift();
      spawnUnit(sim, b, item.kind);
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
    const node = b.rally.nodeId !== undefined ? sim.node(b.rally.nodeId) : undefined;
    if (node && UNIT_DEFS[kind].canGather) {
      setOrder(u, { type: 'gather', nodeId: node.id, nodeKind: node.kind, tx: node.tx, ty: node.ty, phase: 'collect', avoid: [] });
    } else {
      setOrder(u, { type: 'move', tx: b.rally.tx, ty: b.rally.ty });
    }
  }
  return u;
}

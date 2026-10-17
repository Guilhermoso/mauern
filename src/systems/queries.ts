import { BUILDING_DEFS, NODE_DEFS } from '../data/defs';
import { BALANCE } from '../data/balance';
import type { Sim } from '../core/sim';
import type { Building, ResourceKind, ResourceNode, ResourceNodeKind, Unit } from '../entities/types';

// Consultas usadas pelos sistemas: recurso mais próximo, ponto de entrega mais próximo etc.

export function unitTile(sim: Sim, u: Unit): { tx: number; ty: number } {
  return { tx: Math.floor(u.x / sim.tileSize), ty: Math.floor(u.y / sim.tileSize) };
}

// Um recurso é "acessível" se tem pelo menos um vizinho livre (árvores no meio da floresta não são).
export function isExposed(sim: Sim, n: ResourceNode): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && sim.nav.isFree(n.tx + dx, n.ty + dy)) return true;
    }
  }
  return false;
}

export function findNearestNode(
  sim: Sim,
  kind: ResourceNodeKind,
  tx: number,
  ty: number,
  radius: number,
  avoid: readonly number[] = [],
  gatherers?: ReadonlyMap<number, number>, // se informado, pula recursos já lotados
): ResourceNode | undefined {
  const max = BALANCE.units.maxGatherersPerNode;
  let best: ResourceNode | undefined;
  let bestD = Infinity;
  // Anéis crescentes em volta do ponto: para assim que nenhum anel mais distante pode ter algo mais perto.
  for (let r = 0; r <= radius; r++) {
    if (r * r > bestD) break;
    for (let y = ty - r; y <= ty + r; y++) {
      const edgeRow = y === ty - r || y === ty + r;
      for (let x = tx - r; x <= tx + r; x += edgeRow ? 1 : 2 * r || 1) {
        const n = sim.nodeAt(x, y);
        if (!n || n.kind !== kind || avoid.includes(n.id)) continue;
        if (gatherers && (gatherers.get(n.id) ?? 0) >= max) continue;
        const d = (x - tx) ** 2 + (y - ty) ** 2;
        if (d < bestD && isExposed(sim, n)) {
          bestD = d;
          best = n;
        }
      }
    }
  }
  return best;
}

// Quantos aldeões estão designados a cada recurso (indo, coletando ou levando ao depósito).
export function gathererCounts(sim: Sim, exceptUnitId = 0): Map<number, number> {
  const out = new Map<number, number>();
  for (const u of sim.state.units) {
    if (u.id === exceptUnitId || u.order.type !== 'gather' || u.order.nodeId < 0) continue;
    out.set(u.order.nodeId, (out.get(u.order.nodeId) ?? 0) + 1);
  }
  return out;
}

export function nodeHasRoom(sim: Sim, n: ResourceNode, exceptUnitId = 0): boolean {
  return (gathererCounts(sim, exceptUnitId).get(n.id) ?? 0) < BALANCE.units.maxGatherersPerNode;
}

// Próximo recurso de um aldeão: o mais perto do depósito (para encurtar as viagens), entre os que
// ainda têm vaga. Sem depósito ou sem nada perto dele, o mais perto de onde o aldeão estava.
export function pickNextNode(
  sim: Sim,
  u: Unit,
  kind: ResourceNodeKind,
  fromTx: number,
  fromTy: number,
  avoid: readonly number[] = [],
): ResourceNode | undefined {
  const counts = gathererCounts(sim, u.id);
  const ts = sim.tileSize;
  const drop = findNearestDropsite(sim, NODE_DEFS[kind].resource, (fromTx + 0.5) * ts, (fromTy + 0.5) * ts);
  if (drop) {
    const c = buildingCenter(sim, drop);
    const near = findNearestNode(sim, kind, Math.floor(c.x / ts), Math.floor(c.y / ts), BALANCE.units.dropsiteSearchRadius, avoid, counts);
    if (near) return near;
  }
  return findNearestNode(sim, kind, fromTx, fromTy, BALANCE.units.nodeSearchRadius, avoid, counts);
}

export function buildingCenter(sim: Sim, b: Building): { x: number; y: number } {
  const s = BUILDING_DEFS[b.kind].size * sim.tileSize;
  return { x: b.tx * sim.tileSize + s / 2, y: b.ty * sim.tileSize + s / 2 };
}

export function findNearestDropsite(sim: Sim, kind: ResourceKind, x: number, y: number): Building | undefined {
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of sim.state.buildings) {
    if (!b.built || !BUILDING_DEFS[b.kind].dropsite.includes(kind)) continue;
    const c = buildingCenter(sim, b);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function findFreeFarm(sim: Sim, x: number, y: number, radiusTiles: number): Building | undefined {
  let best: Building | undefined;
  let bestD = (radiusTiles * sim.tileSize) ** 2;
  for (const b of sim.state.buildings) {
    if (b.kind !== 'farm' || !b.built || farmTaken(sim, b)) continue;
    const c = buildingCenter(sim, b);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

// Uma fazenda está ocupada se outro aldeão vivo está trabalhando nela.
export function farmTaken(sim: Sim, farm: Building, exceptUnitId = 0): boolean {
  if (!farm.farmerId || farm.farmerId === exceptUnitId) return false;
  const u = sim.unit(farm.farmerId);
  return !!u && u.order.type === 'farm' && u.order.buildingId === farm.id;
}

export function findUnfinishedBuilding(sim: Sim, x: number, y: number, radiusTiles: number): Building | undefined {
  let best: Building | undefined;
  let bestD = (radiusTiles * sim.tileSize) ** 2;
  for (const b of sim.state.buildings) {
    if (b.built) continue;
    const c = buildingCenter(sim, b);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function nodeResource(n: ResourceNode): ResourceKind {
  return NODE_DEFS[n.kind].resource;
}

export function idleVillagers(sim: Sim): Unit[] {
  return sim.state.units.filter((u) => u.kind === 'villager' && u.order.type === 'idle');
}

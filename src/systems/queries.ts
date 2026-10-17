import { BUILDING_DEFS, NODE_DEFS } from '../data/defs';
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
): ResourceNode | undefined {
  let best: ResourceNode | undefined;
  let bestD = Infinity;
  for (let y = ty - radius; y <= ty + radius; y++) {
    for (let x = tx - radius; x <= tx + radius; x++) {
      const n = sim.nodeAt(x, y);
      if (!n || n.kind !== kind || avoid.includes(n.id)) continue;
      const d = (x - tx) ** 2 + (y - ty) ** 2;
      if (d < bestD && isExposed(sim, n)) {
        bestD = d;
        best = n;
      }
    }
  }
  return best;
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

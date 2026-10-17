import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import type { Building, Unit, UnitOrder } from '../entities/types';
import { clearPath, moveTo } from './movement';
import { ejectGarrison, garrisonCount } from './damage';
import { buildingCenter } from './queries';
import { nearestTitan } from './combat';

const R = BALANCE.refuge;
const DT = 1 / BALANCE.time.ticksPerSecond;

type FleeOrder = Extract<UnitOrder, { type: 'flee' }>;

// Aldeões não ficam parados esperando ser devorados: quando um titã chega perto, largam o que
// estavam fazendo e correm para um abrigo (de preferência um Campo de Refúgio), aterrorizados.

function shelterFor(sim: Sim, u: Unit): Building | undefined {
  let best: Building | undefined;
  let bestScore = Infinity;
  for (const b of sim.state.buildings) {
    const def = BUILDING_DEFS[b.kind];
    if (!b.built || def.garrison <= 0 || garrisonCount(sim, b) + reserved(sim, b) >= def.garrison) continue;
    const c = buildingCenter(sim, b);
    // O Campo de Refúgio é preferido: vale como se estivesse 3× mais perto.
    const score = Math.hypot(c.x - u.x, c.y - u.y) / (b.kind === 'refuge' ? 3 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

// Quantos aldeões já estão correndo para este abrigo.
function reserved(sim: Sim, b: Building): number {
  let n = 0;
  for (const u of sim.state.units) if (u.order.type === 'flee' && u.order.buildingId === b.id) n++;
  return n;
}

export function startFlee(sim: Sim, u: Unit, from: { x: number; y: number }): void {
  if (u.order.type !== 'flee' && u.order.type !== 'garrison') u.prevOrder = u.order.type === 'idle' ? null : u.order;
  u.terror = R.terrorSeconds;
  const shelter = shelterFor(sim, u);
  const ts = sim.tileSize;
  if (shelter) {
    u.order = { type: 'flee', buildingId: shelter.id, tx: shelter.tx, ty: shelter.ty };
  } else {
    // Sem abrigo com vaga: corre para longe do titã.
    const dx = u.x - from.x;
    const dy = u.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    let tx = Math.floor((u.x + (dx / d) * R.runAwayTiles * ts) / ts);
    let ty = Math.floor((u.y + (dy / d) * R.runAwayTiles * ts) / ts);
    for (let r = 0; r < 5 && !sim.nav.isFree(tx, ty); r++) {
      tx += Math.sign(dx);
      ty += Math.sign(dy);
    }
    u.order = { type: 'flee', buildingId: 0, tx, ty };
  }
  clearPath(u);
}

// Verifica, de tempos em tempos, se algum aldeão precisa fugir.
export function updateFear(sim: Sim): void {
  const s = sim.state;
  const radius = R.fleeRadius * sim.tileSize;
  for (const u of s.units) {
    if (u.kind !== 'villager' || u.garrison || (s.tick + u.id) % 8 !== 0) continue;
    if (u.order.type === 'flee' || u.order.type === 'garrison') continue;
    const t = nearestTitan(sim, u.x, u.y, radius);
    if (t) startFlee(sim, u, t);
  }
}

export function updateFleeOrder(sim: Sim, u: Unit, o: FleeOrder): void {
  if (o.buildingId) {
    const b = sim.building(o.buildingId);
    if (!b || !b.built) {
      startFlee(sim, u, { x: u.x, y: u.y - 1 });
      return;
    }
    const def = BUILDING_DEFS[b.kind];
    const r = moveTo(sim, u, { x0: b.tx, y0: b.ty, x1: b.tx + def.size - 1, y1: b.ty + def.size - 1, adjacent: true });
    if (r === 'moving') return;
    if (r === 'arrived' && garrisonCount(sim, b) < def.garrison) {
      const c = buildingCenter(sim, b);
      u.garrison = b.id;
      u.x = c.x;
      u.y = c.y;
      u.order = { type: 'idle' };
      clearPath(u);
      return;
    }
    // Lotado ou inalcançável: procura outro abrigo (ou corre para longe).
    startFlee(sim, u, { x: u.x, y: u.y - 1 });
    return;
  }
  const r = moveTo(sim, u, { x0: o.tx, y0: o.ty, x1: o.tx, y1: o.ty, adjacent: false });
  if (r !== 'moving') {
    u.order = { type: 'idle' };
    clearPath(u);
  }
}

export function guardOf(sim: Sim, refuge: Building): Unit | undefined {
  if (!refuge.guardId) return undefined;
  const g = sim.unit(refuge.guardId);
  return g && g.garrison === refuge.id ? g : undefined;
}

// O terror passa com o tempo; dentro de um Campo de Refúgio com guarda, passa mais rápido.
// Quem fugiu para longe (sem abrigo) volta sozinho ao trabalho quando o terror acaba;
// quem está abrigado espera o jogador liberar.
export function updateTerror(sim: Sim): void {
  for (const u of sim.state.units) {
    if (u.terror <= 0) continue;
    let rate = 1;
    if (u.garrison) {
      const b = sim.building(u.garrison);
      const g = b && b.kind === 'refuge' ? guardOf(sim, b) : undefined;
      if (g) rate += g.level * R.guardBonusPerLevel;
    }
    u.terror = Math.max(0, u.terror - DT * rate);
    if (u.terror === 0 && !u.garrison && u.order.type === 'idle' && u.prevOrder) {
      u.order = u.prevOrder;
      u.prevOrder = null;
      clearPath(u);
    }
  }
}

// Libera os abrigados que já não estão aterrorizados. resumeWork: voltam ao que faziam antes.
// O guarda do refúgio fica no posto.
export function releaseShelter(sim: Sim, buildingId: number, resumeWork: boolean): number {
  const b = sim.building(buildingId);
  if (!b) return 0;
  const out = ejectGarrison(sim, b, (u) => u.terror <= 0 && u.id !== b.guardId);
  for (const u of out) {
    if (resumeWork && u.prevOrder) u.order = u.prevOrder;
    u.prevOrder = null;
  }
  return out.length;
}

export function dismissGuard(sim: Sim, refugeId: number): void {
  const b = sim.building(refugeId);
  if (!b) return;
  const g = guardOf(sim, b);
  b.guardId = 0;
  if (g) ejectGarrison(sim, b, (u) => u.id === g.id);
}

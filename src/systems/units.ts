import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, FARM_GATHER_RATE, NODE_DEFS, buildingMessage } from '../data/defs';
import { buildingMaxHp, carryCapacity, flat, mult, workSpeed } from './modifiers';
import { getClock } from '../core/time';
import type { Sim } from '../core/sim';
import { isFemaleName } from '../entities/names';
import { addLog } from '../state';
import type { Building, Unit, UnitOrder } from '../entities/types';
import type { Goal } from '../world/pathfinding';
import { clearPath, face, moveTo, separateUnits } from './movement';
import { autoAcquire, updateAttack, updateGarrisonOrder } from './combat';
import {
  buildingCenter,
  findFreeFarm,
  findNearestDropsite,
  findNearestNode,
  farmTaken,
  findUnfinishedBuilding,
  nodeResource,
  unitTile,
} from './queries';

const DT = 1 / BALANCE.time.ticksPerSecond;

type GatherOrder = Extract<UnitOrder, { type: 'gather' }>;
type FarmOrder = Extract<UnitOrder, { type: 'farm' }>;

export function setOrder(u: Unit, order: UnitOrder): void {
  u.order = order;
  u.work = 0;
  clearPath(u);
}

export function setIdle(u: Unit): void {
  setOrder(u, { type: 'idle' });
}

export function updateUnits(sim: Sim): void {
  for (const u of [...sim.state.units]) {
    if (u.garrison) continue;
    if (u.attackCooldown > 0) u.attackCooldown -= DT;
    const o = u.order;
    switch (o.type) {
      case 'idle':
        u.moving = false;
        autoAcquire(sim, u);
        break;
      case 'attack':
        if (!updateAttack(sim, u, o)) {
          setIdle(u);
          autoAcquire(sim, u);
        }
        break;
      case 'garrison':
        if (!updateGarrisonOrder(sim, u, o) && !u.garrison) setIdle(u);
        break;
      case 'move':
        if (moveTo(sim, u, { x0: o.tx, y0: o.ty, x1: o.tx, y1: o.ty, adjacent: false }) !== 'moving') setIdle(u);
        break;
      case 'gather':
        updateGather(sim, u, o);
        break;
      case 'farm':
        updateFarm(sim, u, o);
        break;
      case 'build':
        updateBuild(sim, u, o.buildingId);
        break;
      case 'deliver': {
        const b = sim.building(o.buildingId);
        if (!b || !u.carry) setIdle(u);
        else if (deliverTo(sim, u, b) !== 'moving') setIdle(u);
        break;
      }
    }
  }
  separateUnits(sim);
}

function buildingGoal(b: Building, adjacent = true): Goal {
  const s = BUILDING_DEFS[b.kind].size;
  return { x0: b.tx, y0: b.ty, x1: b.tx + s - 1, y1: b.ty + s - 1, adjacent };
}

// Leva o que o aldeão carrega até o edifício. Retorna 'done' ao entregar.
function deliverTo(sim: Sim, u: Unit, b: Building): 'moving' | 'done' | 'unreachable' {
  const r = moveTo(sim, u, buildingGoal(b));
  if (r === 'unreachable') return 'unreachable';
  if (r === 'moving') return 'moving';
  if (u.carry && BUILDING_DEFS[b.kind].dropsite.includes(u.carry.kind)) {
    sim.state.resources[u.carry.kind] += u.carry.amount;
    sim.state.stats.gathered[u.carry.kind] += u.carry.amount;
  }
  u.carry = null;
  return 'done';
}

// Fase de entrega comum à coleta e às fazendas. Retorna true quando terminou de entregar.
function dropPhase(sim: Sim, u: Unit): boolean {
  if (!u.carry) return true;
  const site = findNearestDropsite(sim, u.carry.kind, u.x, u.y);
  if (!site) {
    // Sem lugar para entregar: o aldeão espera, carregando.
    setIdle(u);
    return false;
  }
  const r = deliverTo(sim, u, site);
  if (r === 'unreachable') setIdle(u);
  return r === 'done';
}

// Velocidade de coleta de um recurso: base × tecnologias/relíquias × moral.
export function gatherRate(sim: Sim, kind: GatherOrder['nodeKind']): number {
  const s = sim.state;
  const res = NODE_DEFS[kind].resource;
  const bonus = res === 'wood' ? mult(s, 'gatherWood') : res === 'food' ? mult(s, 'gatherFood') : mult(s, 'gatherStone');
  return NODE_DEFS[kind].gatherRate * bonus * workSpeed(s);
}

export function farmRate(sim: Sim): number {
  const s = sim.state;
  const season = getClock(s.tick).seasonIndex;
  let seasonMult: number = BALANCE.city.farmSeasonMultiplier[season];
  if (season === 3) seasonMult = flat(s, 'winterFarm');
  return FARM_GATHER_RATE * seasonMult * mult(s, 'farm') * workSpeed(s);
}

function updateGather(sim: Sim, u: Unit, o: GatherOrder): void {
  const cap = carryCapacity(sim.state, u);
  if (o.phase === 'drop') {
    if (dropPhase(sim, u) && u.order === o) {
      o.phase = 'collect';
      clearPath(u);
    }
    return;
  }

  let node = sim.node(o.nodeId);
  if (!node) {
    // O recurso acabou (ou era inalcançável): procura outro igual por perto.
    node = findNearestNode(sim, o.nodeKind, o.tx, o.ty, BALANCE.units.nodeSearchRadius, o.avoid);
    if (!node) {
      if (u.carry && u.carry.amount > 0) {
        o.phase = 'drop';
        o.nodeId = -1;
        clearPath(u);
      } else {
        setIdle(u);
      }
      return;
    }
    o.nodeId = node.id;
    o.tx = node.tx;
    o.ty = node.ty;
    clearPath(u);
  }

  const resource = nodeResource(node);
  if (u.carry && u.carry.kind !== resource) u.carry = null; // trocou de recurso: perde o que carregava
  if (u.carry && u.carry.amount >= cap) {
    o.phase = 'drop';
    clearPath(u);
    return;
  }

  const r = moveTo(sim, u, { x0: node.tx, y0: node.ty, x1: node.tx, y1: node.ty, adjacent: true });
  if (r === 'unreachable') {
    // Depois de várias tentativas sem conseguir chegar (ex.: preso atrás de uma paliçada), desiste.
    o.avoid.push(node.id);
    o.nodeId = -1;
    if (o.avoid.length >= 5) setIdle(u);
    return;
  }
  if (r === 'moving') return;

  const ts = sim.tileSize;
  face(u, (node.tx + 0.5) * ts, (node.ty + 0.5) * ts);
  u.work += gatherRate(sim, node.kind) * DT;
  while (u.work >= 1) {
    u.work -= 1;
    if (!u.carry) u.carry = { kind: resource, amount: 0 };
    u.carry.amount++;
    node.amount--;
    if (node.amount <= 0) {
      sim.removeNode(node);
      o.nodeId = -1;
      break;
    }
    if (u.carry.amount >= cap) break;
  }
  if (u.carry && u.carry.amount >= cap) {
    o.phase = 'drop';
    clearPath(u);
  }
}

function updateFarm(sim: Sim, u: Unit, o: FarmOrder): void {
  const cap = carryCapacity(sim.state, u);
  if (o.phase === 'drop') {
    if (dropPhase(sim, u) && u.order === o) {
      o.phase = 'collect';
      clearPath(u);
    }
    return;
  }
  let farm = sim.building(o.buildingId);
  // Fazenda destruída ou ocupada por outro aldeão: procura outra livre.
  if (!farm || !farm.built || farmTaken(sim, farm, u.id)) {
    farm = findFreeFarm(sim, u.x, u.y, BALANCE.units.autoTaskRadius);
    if (!farm) {
      setIdle(u);
      return;
    }
    o.buildingId = farm.id;
    clearPath(u);
  }
  farm.farmerId = u.id;
  if (u.carry && u.carry.kind !== 'food') u.carry = null;
  if (u.carry && u.carry.amount >= cap) {
    o.phase = 'drop';
    clearPath(u);
    return;
  }
  // O aldeão trabalha dentro da fazenda (no tile central).
  const c = Math.floor(BUILDING_DEFS.farm.size / 2);
  const r = moveTo(sim, u, { x0: farm.tx + c, y0: farm.ty + c, x1: farm.tx + c, y1: farm.ty + c, adjacent: false });
  if (r === 'unreachable') {
    setIdle(u);
    return;
  }
  if (r === 'moving') return;
  u.moving = false;
  u.work += farmRate(sim) * DT;
  while (u.work >= 1) {
    u.work -= 1;
    if (!u.carry) u.carry = { kind: 'food', amount: 0 };
    u.carry.amount++;
  }
  if (u.carry && u.carry.amount >= cap) {
    o.phase = 'drop';
    clearPath(u);
  }
}

function updateBuild(sim: Sim, u: Unit, buildingId: number): void {
  const b = sim.building(buildingId);
  if (!b) {
    setIdle(u);
    return;
  }
  const def = BUILDING_DEFS[b.kind];
  const maxHp = buildingMaxHp(sim.state, b);
  const speed = mult(sim.state, 'build') * workSpeed(sim.state);
  if (b.built && b.hp >= maxHp) {
    afterBuilding(sim, u, b);
    return;
  }
  const r = moveTo(sim, u, buildingGoal(b));
  if (r === 'unreachable') {
    setIdle(u);
    return;
  }
  if (r === 'moving') return;
  const c = buildingCenter(sim, b);
  face(u, c.x, c.y);
  if (b.built) {
    // Reparo: devolve a vida aos poucos, sem custo.
    b.hp = Math.min(maxHp, b.hp + (maxHp / def.buildTime) * BALANCE.combat.repairRateFactor * speed * DT);
    return;
  }
  b.progress = Math.min(def.buildTime, b.progress + DT * speed);
  b.hp = Math.max(1, Math.round(maxHp * (b.progress / def.buildTime)));
  if (b.progress >= def.buildTime) completeBuilding(sim, b);
}

export function completeBuilding(sim: Sim, b: Building): void {
  b.built = true;
  const def = BUILDING_DEFS[b.kind];
  b.hp = buildingMaxHp(sim.state, b);
  // Segmentos de muralha não vão para o diário, um por um.
  if (!def.wall) addLog(sim.state, buildingMessage(def, 'concluído', 'concluída'));
}

// O que o construtor faz ao terminar: coleta o recurso do depósito, trabalha na fazenda,
// ajuda em outra construção por perto ou fica ocioso.
function afterBuilding(sim: Sim, u: Unit, b: Building): void {
  const def = BUILDING_DEFS[b.kind];
  const radius = BALANCE.units.autoTaskRadius;
  if (b.kind === 'farm' && !farmTaken(sim, b, u.id)) {
    b.farmerId = u.id;
    setOrder(u, { type: 'farm', buildingId: b.id, phase: 'collect' });
    return;
  }
  const other = findUnfinishedBuilding(sim, u.x, u.y, radius);
  if (other) {
    setOrder(u, { type: 'build', buildingId: other.id });
    return;
  }
  if (def.autoGather) {
    const c = buildingCenter(sim, b);
    const tx = Math.floor(c.x / sim.tileSize);
    const ty = Math.floor(c.y / sim.tileSize);
    let node = findNearestNode(sim, def.autoGather, tx, ty, radius);
    // Depósito de mineração também serve para ferro.
    if (!node && b.kind === 'miningCamp') node = findNearestNode(sim, 'iron', tx, ty, radius);
    if (node) {
      setOrder(u, { type: 'gather', nodeId: node.id, nodeKind: node.kind, tx: node.tx, ty: node.ty, phase: 'collect', avoid: [] });
      return;
    }
  }
  if (b.kind === 'mill') {
    const farm = findFreeFarm(sim, u.x, u.y, radius);
    if (farm) {
      farm.farmerId = u.id;
      setOrder(u, { type: 'farm', buildingId: farm.id, phase: 'collect' });
      return;
    }
  }
  setIdle(u);
}

export function unitStatus(sim: Sim, u: Unit): string {
  if (u.garrison) {
    const b = sim.building(u.garrison);
    return `${isFemaleName(u.name) ? 'Abrigada' : 'Abrigado'} ${b ? `em ${BUILDING_DEFS[b.kind].name.toLowerCase()}` : ''}`;
  }
  const o = u.order;
  const carrying = u.carry ? ` (carregando ${u.carry.amount})` : '';
  switch (o.type) {
    case 'idle':
      return u.kind === 'villager' ? `Ocioso${carrying}` : 'Parado';
    case 'move':
      return 'Andando';
    case 'gather': {
      const name = NODE_DEFS[o.nodeKind].name.toLowerCase();
      if (o.phase === 'drop') return `Levando ${resourceVerb(o.nodeKind)} ao depósito${carrying}`;
      return `${u.moving ? 'Indo até' : 'Coletando'} ${name}${carrying}`;
    }
    case 'farm':
      if (o.phase === 'drop') return `Levando comida ao depósito${carrying}`;
      return farmRate(sim) === 0 ? 'Inverno: a terra está congelada' : `Trabalhando na fazenda${carrying}`;
    case 'build': {
      const b = sim.building(o.buildingId);
      if (!b) return 'Construindo';
      const verb = b.built ? (u.moving ? 'Indo reparar' : 'Reparando') : u.moving ? 'Indo construir' : 'Construindo';
      return `${verb} ${BUILDING_DEFS[b.kind].name.toLowerCase()}`;
    }
    case 'deliver':
      return `Entregando recursos${carrying}`;
    case 'attack':
      return u.moving ? 'Avançando contra um titã' : 'Lutando contra um titã';
    case 'garrison':
      return 'Indo se abrigar';
  }
}

function resourceVerb(kind: GatherOrder['nodeKind']): string {
  return { tree: 'madeira', berries: 'comida', stone: 'pedra', iron: 'ferro', crystal: 'cristais' }[kind];
}

export { unitTile };

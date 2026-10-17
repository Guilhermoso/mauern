import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { addLog } from '../state';
import type { Building, Titan, Unit, UnitOrder } from '../entities/types';
import { clearPath, moveTo, stepToward } from './movement';
import { ejectGarrison, garrisonCount, killTitan, titanRadius } from './damage';
import { buildingCenter } from './queries';
import { flat, unitAttack } from './modifiers';
import { gainXp } from './soldiers';
import { damageToTitanFactor } from './nobility';
import { honors } from './modifiers';
import { canEnterHospital } from './hospital';

const TPS = BALANCE.time.ticksPerSecond;
const DT = 1 / TPS;

type AttackOrder = Extract<UnitOrder, { type: 'attack' }>;
type GarrisonOrder = Extract<UnitOrder, { type: 'garrison' }>;

// Dano em titã. Se veio de um soldado, ele ganha experiência (e, no abate, o batalhão também).
export function hitTitan(sim: Sim, t: Titan, damage: number, attacker?: Unit): void {
  // Titã intimidado por uma lenda: vida base 5% menor (cada golpe conta mais).
  t.hp -= damage * damageToTitanFactor(sim, t.id);
  t.lastHitTick = sim.state.tick;
  const S = BALANCE.soldiers;
  if (attacker) gainXp(sim, attacker, damage * S.xpPerDamage);
  if (t.hp <= 0) {
    killTitan(sim, t);
    if (attacker) {
      // O abate conta para quem golpeou e, num batalhão, para todos os integrantes.
      const credited = attacker.battalion ? sim.state.units.filter((u) => u.battalion === attacker.battalion) : [attacker];
      const honored: string[] = [];
      for (const u of credited) {
        const before = honors(u);
        u.kills++;
        const now = honors(u);
        if (now > before) honored.push(credited.length > 1 ? `${u.name} (${now}ª)` : `${u.name} recebeu a ${now}ª honra (${u.kills} titãs abatidos)`);
      }
      if (honored.length) {
        const b = attacker.battalion ? sim.state.battalions.find((x) => x.id === attacker.battalion) : undefined;
        const text = b && credited.length > 1 ? `Honra para o ${b.name}: ${honored.join(', ')}.` : `${honored[0]}.`;
        addLog(sim.state, text);
        sim.alerts.push({ kind: 'promotion', text, x: attacker.x, y: attacker.y });
      }
      const bonus = S.xpPerKillPerMeter * t.height;
      gainXp(sim, attacker, bonus);
      if (attacker.battalion) {
        const others = sim.state.units.filter((u) => u.battalion === attacker.battalion && u !== attacker);
        for (const u of others) gainXp(sim, u, (bonus * S.battalionShareOfKill) / others.length);
      }
    }
  }
}

export function nearestTitan(sim: Sim, x: number, y: number, radiusPx: number): Titan | undefined {
  let best: Titan | undefined;
  let bestD = radiusPx * radiusPx;
  for (const t of sim.state.titans) {
    const d = (t.x - x) ** 2 + (t.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

// Unidade perseguindo e golpeando um titã. Retorna false se o alvo sumiu.
export function updateAttack(sim: Sim, u: Unit, o: AttackOrder): boolean {
  const t = sim.titan(o.titanId);
  if (!t) return false;
  const ts = sim.tileSize;
  const def = UNIT_DEFS[u.kind];
  const reach = def.radius + titanRadius(t.height) + BALANCE.combat.meleeReach;
  const d = Math.hypot(t.x - u.x, t.y - u.y);
  if (d <= reach) {
    u.moving = false;
    u.facing = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.attackCooldown <= 0) {
      u.attackCooldown = def.attackCooldown;
      u.lastCombatTick = sim.state.tick;
      sim.fx.push({ type: 'hit', x: t.x, y: t.y });
      hitTitan(sim, t, unitAttack(sim.state, u), u);
    }
    return true;
  }
  if (d < 2.5 * ts) {
    // Perto: vai direto, se o tile seguinte estiver livre.
    const nx = u.x + ((t.x - u.x) / d) * 6;
    const ny = u.y + ((t.y - u.y) / d) * 6;
    if (sim.nav.isFree(Math.floor(nx / ts), Math.floor(ny / ts))) {
      clearPath(u);
      stepToward(u, t.x, t.y);
      return true;
    }
  }
  // Qualquer tile livre ao alcance do golpe serve (titãs andam por florestas, onde o tile vizinho
  // costuma estar ocupado por árvores). A busca é limitada e recalculada no máximo a cada 1 s.
  const tx = Math.floor(t.x / ts);
  const ty = Math.floor(t.y / ts);
  const r = Math.max(1, Math.floor(reach / ts));
  let goal = { x0: tx - r, y0: ty - r, x1: tx + r, y1: ty + r, adjacent: false };
  // Titã num lugar que a unidade não alcança (ex.: no meio da floresta): vai até o tile alcançável
  // mais perto dele e espera lá.
  const region = sim.nav.regionAt(Math.floor(u.x / ts), Math.floor(u.y / ts));
  if (region && !regionHasTile(sim, goal, region)) {
    const near = nearestTileInRegion(sim, tx, ty, region, 8);
    if (near) goal = { x0: near.x, y0: near.y, x1: near.x, y1: near.y, adjacent: false };
  }
  const res = moveTo(sim, u, goal, { maxExpand: 12000, repathTicks: TPS });
  // Inalcançável por enquanto: espera no ponto mais próximo (o titã costuma vir até os humanos).
  if (res === 'unreachable') u.moving = false;
  return true;
}

function regionHasTile(sim: Sim, g: { x0: number; y0: number; x1: number; y1: number }, region: number): boolean {
  for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) if (sim.nav.regionAt(x, y) === region) return true;
  return false;
}

function nearestTileInRegion(sim: Sim, cx: number, cy: number, region: number, radius: number): { x: number; y: number } | null {
  for (let r = 1; r <= radius; r++) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || sim.nav.regionAt(x, y) !== region) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

// Unidades militares paradas atacam titãs que chegam perto.
export function autoAcquire(sim: Sim, u: Unit): void {
  if (!UNIT_DEFS[u.kind].autoAttack || (sim.state.tick + u.id) % 10 !== 0) return;
  const t = nearestTitan(sim, u.x, u.y, BALANCE.combat.autoAttackRadius * sim.tileSize);
  if (t) {
    u.order = { type: 'attack', titanId: t.id };
    clearPath(u);
  }
}

export function updateGarrisonOrder(sim: Sim, u: Unit, o: GarrisonOrder): boolean {
  const b = sim.building(o.buildingId);
  if (!b || !b.built) return false;
  const def = BUILDING_DEFS[b.kind];
  const r = moveTo(sim, u, { x0: b.tx, y0: b.ty, x1: b.tx + def.size - 1, y1: b.ty + def.size - 1, adjacent: true });
  if (r === 'unreachable') return false;
  if (r === 'moving') return true;
  if (def.hospital ? !canEnterHospital(sim, b, u) : garrisonCount(sim, b) >= def.garrison) return false;
  const c = buildingCenter(sim, b);
  u.garrison = b.id;
  u.x = c.x;
  u.y = c.y;
  u.order = { type: 'idle' };
  clearPath(u);
  // Soldado que entra num Campo de Refúgio sem guarda assume o posto.
  if (b.kind === 'refuge' && UNIT_DEFS[u.kind].military) {
    const g = b.guardId ? sim.unit(b.guardId) : undefined;
    if (!g || g.garrison !== b.id) b.guardId = u.id;
  }
  return true;
}

// Edifícios com ataque (torres, Centro da Vila com gente dentro) atiram flechas no titã mais próximo.
export function updateBuildingAttacks(sim: Sim): void {
  for (const b of sim.state.buildings) {
    const atk = BUILDING_DEFS[b.kind].attack;
    if (!atk || !b.built) continue;
    if (b.attackCooldown > 0) {
      b.attackCooldown -= DT;
      continue;
    }
    const n = garrisonCount(sim, b);
    if (atk.needsGarrison && n === 0) continue;
    const c = buildingCenter(sim, b);
    const range = atk.range + (b.kind === 'watchTower' ? flat(sim.state, 'towerRange') : 0);
    const t = nearestTitan(sim, c.x, c.y, range * sim.tileSize);
    if (!t) continue;
    b.attackCooldown = atk.cooldown;
    sim.fx.push({ type: 'arrow', x: c.x, y: c.y - 10, x2: t.x, y2: t.y });
    hitTitan(sim, t, atk.damage + flat(sim.state, 'arrowDamage') + atk.damagePerGarrison * n);
  }
}

function shelters(sim: Sim): Building[] {
  return sim.state.buildings.filter((b) => b.built && BUILDING_DEFS[b.kind].garrison > 0);
}

// Sino de alarme: aldeões param o que fazem e correm para o abrigo mais próximo com vaga.
export function ringAlarm(sim: Sim): void {
  const state = sim.state;
  state.alarm = true;
  const radius = BALANCE.combat.alarmRadius * sim.tileSize;
  const free = new Map<number, number>();
  for (const b of shelters(sim)) free.set(b.id, BUILDING_DEFS[b.kind].garrison - garrisonCount(sim, b));
  for (const u of state.units) {
    if (u.kind !== 'villager' || u.garrison) continue;
    let best: Building | undefined;
    let bestD = radius;
    for (const b of shelters(sim)) {
      if ((free.get(b.id) ?? 0) <= 0) continue;
      const c = buildingCenter(sim, b);
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) continue;
    free.set(best.id, free.get(best.id)! - 1);
    if (u.order.type !== 'garrison') u.prevOrder = u.order;
    u.order = { type: 'garrison', buildingId: best.id };
    clearPath(u);
  }
  addLog(state, 'O sino de alarme toca! Os aldeões correm para os abrigos.');
}

// Fim do alarme: todos saem e voltam ao que estavam fazendo.
export function stopAlarm(sim: Sim): void {
  const state = sim.state;
  state.alarm = false;
  for (const b of shelters(sim)) {
    for (const u of ejectGarrison(sim, b, (x) => x.kind === 'villager' && x.terror <= 0)) {
      if (u.prevOrder) u.order = u.prevOrder;
      u.prevOrder = null;
    }
  }
  for (const u of state.units) {
    if (u.order.type === 'garrison' && u.prevOrder) {
      u.order = u.prevOrder;
      clearPath(u);
    }
    u.prevOrder = null;
  }
  addLog(state, 'Fim do alarme. Todos de volta ao trabalho.');
}

import { BALANCE } from '../data/balance';
import { UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { addLog } from '../state';
import type { Battalion, BattalionMode, Unit } from '../entities/types';
import { clearPath, moveTo, stepToward } from './movement';
import { titanAt } from './commands';
import { isSoldier } from './soldiers';
import { nearestTitan } from './combat';
import { freeBeds, nearestHospitalWithBeds } from './hospital';
import { unitMaxHp } from './modifiers';
import { BUILDING_DEFS } from '../data/defs';

const S = BALANCE.soldiers;

// Batalhões: um comandante e soldados que andam e lutam juntos. O tamanho máximo
// depende do nível do comandante. Modos: manual (o jogador comanda), defender um ponto, caçar titãs.

export function battalionCapacity(commanderLevel: number): number {
  return S.battalionBase + Math.floor(commanderLevel / S.battalionPerLevels);
}

export function battalionOf(sim: Sim, id: number): Battalion | undefined {
  return sim.state.battalions.find((b) => b.id === id);
}

export function battalionUnits(sim: Sim, b: Battalion): Unit[] {
  return [b.commanderId, ...b.memberIds].map((id) => sim.unit(id)).filter((u): u is Unit => !!u);
}

function release(u: Unit): void {
  u.battalion = 0;
  u.speedCap = 0;
  u.order = { type: 'idle' };
  clearPath(u);
}

export function formBattalion(sim: Sim, ids: readonly number[]): { battalion?: Battalion; error?: string; leftOut?: number } {
  const soldiers = ids
    .map((id) => sim.unit(id))
    .filter((u): u is Unit => !!u && isSoldier(u) && !u.battalion && !u.garrison)
    .sort((a, b) => b.level - a.level || b.xp - a.xp);
  if (!soldiers.length) return { error: 'Selecione soldados avulsos para formar um batalhão.' };
  const commander = soldiers[0];
  const cap = battalionCapacity(commander.level);
  const members = soldiers.slice(1, 1 + cap);
  const s = sim.state;
  s.battalionCount++;
  const b: Battalion = {
    id: sim.nextId(),
    name: `${s.battalionCount}º Batalhão`,
    commanderId: commander.id,
    memberIds: members.map((u) => u.id),
    mode: 'manual',
    order: { type: 'idle' },
    guard: null,
    patrol: null,
    criticalIds: [commander.id],
    autoHospital: true,
    inHospital: 0,
  };
  s.battalions.push(b);
  for (const u of [commander, ...members]) {
    u.battalion = b.id;
    u.order = u === commander ? { type: 'idle' } : { type: 'follow' };
    clearPath(u);
  }
  addLog(s, `${b.name} formado, sob o comando de ${commander.name}.`);
  return { battalion: b, leftOut: soldiers.length - 1 - members.length };
}

export function disbandBattalion(sim: Sim, id: number): void {
  const b = battalionOf(sim, id);
  if (!b) return;
  for (const u of battalionUnits(sim, b)) release(u);
  sim.state.battalions.splice(sim.state.battalions.indexOf(b), 1);
  addLog(sim.state, `${b.name} foi desfeito.`);
}

// Troca o comandante. Se o novo comandante tiver menos vagas, os excedentes saem do batalhão.
export function setCommander(sim: Sim, id: number, unitId: number): void {
  const b = battalionOf(sim, id);
  if (!b || !b.memberIds.includes(unitId)) return;
  b.memberIds = [b.commanderId, ...b.memberIds.filter((m) => m !== unitId)];
  b.commanderId = unitId;
  if (!b.criticalIds.includes(unitId)) b.criticalIds.push(unitId);
  enforceCapacity(sim, b);
  const c = sim.unit(unitId);
  if (c) {
    c.order = { type: 'idle' };
    clearPath(c);
  }
  for (const m of b.memberIds) {
    const u = sim.unit(m);
    if (u) {
      u.order = { type: 'follow' };
      clearPath(u);
    }
  }
}

function enforceCapacity(sim: Sim, b: Battalion): void {
  const c = sim.unit(b.commanderId);
  if (!c) return;
  const cap = battalionCapacity(c.level);
  if (b.memberIds.length <= cap) return;
  // Ficam os de maior nível.
  const sorted = b.memberIds.map((id) => sim.unit(id)!).filter(Boolean).sort((x, y) => y.level - x.level);
  for (const u of sorted.slice(cap)) release(u);
  b.memberIds = sorted.slice(0, cap).map((u) => u.id);
}

export function setMode(sim: Sim, id: number, mode: BattalionMode): void {
  const b = battalionOf(sim, id);
  if (!b) return;
  b.mode = mode;
  b.patrol = null;
  b.order = { type: 'idle' };
  const c = sim.unit(b.commanderId);
  if (mode === 'defend' && c) b.guard = { tx: Math.floor(c.x / sim.tileSize), ty: Math.floor(c.y / sim.tileSize) };
}

// Comando do jogador (botão direito): o batalhão passa a ser controlado manualmente.
export function battalionCommand(sim: Sim, id: number, wx: number, wy: number): void {
  const b = battalionOf(sim, id);
  if (!b) return;
  b.mode = 'manual';
  b.patrol = null;
  if (b.inHospital) return;
  const titanId = titanAt(sim, wx, wy);
  const target = sim.buildingAt(Math.floor(wx / sim.tileSize), Math.floor(wy / sim.tileSize));
  if (titanId !== null) b.order = { type: 'attack', titanId };
  else if (target && target.built && BUILDING_DEFS[target.kind].hospital) b.order = { type: 'hospital', buildingId: target.id };
  else b.order = { type: 'move', tx: Math.floor(wx / sim.tileSize), ty: Math.floor(wy / sim.tileSize) };
}

// Escolhe quais unidades do batalhão disparam o estado crítico (por padrão, só o comandante).
export function toggleCritical(sim: Sim, id: number, unitId: number): void {
  const b = battalionOf(sim, id);
  if (!b) return;
  b.criticalIds = b.criticalIds.includes(unitId) ? b.criticalIds.filter((x) => x !== unitId) : [...b.criticalIds, unitId];
}

export function setAutoHospital(sim: Sim, id: number, on: boolean): void {
  const b = battalionOf(sim, id);
  if (b) b.autoHospital = on;
}

// Estado crítico: alguma unidade marcada abaixo de 30% de vida.
export function isCritical(sim: Sim, b: Battalion): boolean {
  return b.criticalIds.some((id) => {
    const u = sim.unit(id);
    return !!u && u.battalion === b.id && u.hp < unitMaxHp(sim.state, u) * BALANCE.hospital.criticalHp;
  });
}

// Aviso de "sem leitos" no máximo a cada 30 s por batalhão.
const noBedsWarned = new Map<number, number>();

// Posição de cada membro na formação: fileiras atrás do comandante, viradas para onde ele olha.
export function formationSlot(_sim: Sim, b: Battalion, commander: Unit, index: number): { x: number; y: number } {
  const n = b.memberIds.length;
  const width = Math.max(2, Math.ceil(Math.sqrt(n + 1)));
  const row = Math.floor(index / width) + 1;
  const col = (index % width) - (Math.min(width, n - (row - 1) * width) - 1) / 2;
  const f = commander.facing;
  const sp = S.formationSpacing;
  return {
    x: commander.x - Math.cos(f) * row * sp - Math.sin(f) * col * sp,
    y: commander.y - Math.sin(f) * row * sp + Math.cos(f) * col * sp,
  };
}

export function updateFollow(sim: Sim, u: Unit): void {
  const b = battalionOf(sim, u.battalion);
  const c = b && sim.unit(b.commanderId);
  if (!b || !c) {
    u.order = { type: 'idle' };
    return;
  }
  const slot = formationSlot(sim, b, c, Math.max(0, b.memberIds.indexOf(u.id)));
  const ts = sim.tileSize;
  const d = Math.hypot(slot.x - u.x, slot.y - u.y);
  if (d < 4) {
    u.moving = false;
    u.facing = c.facing;
    return;
  }
  const stx = Math.floor(slot.x / ts);
  const sty = Math.floor(slot.y / ts);
  if (d < 2.5 * ts && sim.nav.isFree(stx, sty)) {
    clearPath(u);
    stepToward(u, slot.x, slot.y);
    return;
  }
  // Longe (ou o lugar está bloqueado): usa o caminho até o tile livre mais perto do comandante.
  const goal = sim.nav.isFree(stx, sty)
    ? { x0: stx, y0: sty, x1: stx, y1: sty, adjacent: false }
    : { x0: Math.floor(c.x / ts), y0: Math.floor(c.y / ts), x1: Math.floor(c.x / ts), y1: Math.floor(c.y / ts), adjacent: true };
  moveTo(sim, u, goal);
}

function pickPatrolPoint(sim: Sim): { tx: number; ty: number } | null {
  const c = sim.state.world.width / 2;
  for (let i = 0; i < 20; i++) {
    const a = sim.rng.range(0, Math.PI * 2);
    const r = sim.rng.range(20, 60);
    const tx = Math.round(c + Math.cos(a) * r);
    const ty = Math.round(c + Math.sin(a) * r);
    if (sim.nav.isFree(tx, ty)) return { tx, ty };
  }
  return null;
}

// Vida máxima de cada soldado no último passo: quando o bônus de comando muda (entrou ou saiu do
// alcance do comandante), a vida atual é ajustada na mesma proporção.
const lastMaxHp = new WeakMap<Sim, Map<number, number>>();

function syncLeadershipHp(sim: Sim): void {
  let map = lastMaxHp.get(sim);
  if (!map) lastMaxHp.set(sim, (map = new Map()));
  const seen = new Set<number>();
  for (const u of sim.state.units) {
    if (!UNIT_DEFS[u.kind].military) continue;
    seen.add(u.id);
    const max = unitMaxHp(sim.state, u);
    const prev = map.get(u.id);
    if (prev !== undefined && prev !== max && prev > 0) u.hp = Math.min(max, u.hp * (max / prev));
    else if (u.hp > max) u.hp = max;
    map.set(u.id, max);
  }
  for (const id of map.keys()) if (!seen.has(id)) map.delete(id);
}

export function updateBattalions(sim: Sim): void {
  const s = sim.state;
  const ts = sim.tileSize;
  syncLeadershipHp(sim);
  for (const b of [...s.battalions]) {
    b.memberIds = b.memberIds.filter((id) => sim.unit(id));
    let c = sim.unit(b.commanderId);
    if (!c) {
      // Comandante caiu: o soldado de maior nível assume.
      const next = b.memberIds.map((id) => sim.unit(id)!).sort((x, y) => y.level - x.level)[0];
      if (!next) {
        s.battalions.splice(s.battalions.indexOf(b), 1);
        addLog(s, `${b.name} foi aniquilado.`);
        continue;
      }
      b.commanderId = next.id;
      b.memberIds = b.memberIds.filter((id) => id !== next.id);
      if (!b.criticalIds.includes(next.id)) b.criticalIds.push(next.id);
      enforceCapacity(sim, b);
      addLog(s, `${next.name} assumiu o comando do ${b.name}.`);
      c = next;
      c.order = { type: 'idle' };
      clearPath(c);
    }
    b.criticalIds = b.criticalIds.filter((id) => id === b.commanderId || b.memberIds.includes(id));
    // Internado: nada a fazer até receber alta.
    if (b.inHospital) {
      if (!sim.building(b.inHospital)) b.inHospital = 0;
      else continue;
    }
    const units = battalionUnits(sim, b);
    // Estado crítico: corre para um hospital com leitos para todos.
    if (b.autoHospital && b.order.type !== 'hospital' && isCritical(sim, b)) {
      const h = nearestHospitalWithBeds(sim, c.x, c.y, units.length, b.id);
      if (h) {
        b.order = { type: 'hospital', buildingId: h.id };
        addLog(s, `${b.name} em estado crítico: recuando para o hospital.`);
      } else if ((noBedsWarned.get(b.id) ?? -Infinity) + 30 * BALANCE.time.ticksPerSecond < s.tick) {
        noBedsWarned.set(b.id, s.tick);
        const text = `${b.name} em estado crítico, mas não há hospital com ${units.length} leitos livres!`;
        sim.alerts.push({ kind: 'underAttack', text, x: c.x, y: c.y });
      }
    }
    if (b.order.type === 'hospital') {
      updateHospitalMarch(sim, b, c, units);
      continue;
    }
    // O comandante anda no passo do mais lento, para o batalhão não se separar.
    const slowest = Math.min(...units.map((u) => UNIT_DEFS[u.kind].speed));
    for (const u of units) u.speedCap = u === c ? slowest : 0;

    // Decide a ordem do batalhão conforme o modo.
    if (b.order.type === 'attack' && !sim.titan(b.order.titanId)) b.order = { type: 'idle' };
    const cpos = { x: c.x, y: c.y };
    if (b.mode === 'manual') {
      if (b.order.type === 'idle') {
        const t = nearestTitan(sim, cpos.x, cpos.y, (BALANCE.combat.autoAttackRadius + 3) * ts);
        if (t) b.order = { type: 'attack', titanId: t.id };
      }
    } else if (b.mode === 'defend' && b.guard) {
      const gx = (b.guard.tx + 0.5) * ts;
      const gy = (b.guard.ty + 0.5) * ts;
      if (b.order.type !== 'attack') {
        const t = nearestTitan(sim, gx, gy, S.defendRadius * ts);
        if (t) b.order = { type: 'attack', titanId: t.id };
        else if (Math.hypot(cpos.x - gx, cpos.y - gy) > 3 * ts) b.order = { type: 'move', tx: b.guard.tx, ty: b.guard.ty };
        else b.order = { type: 'idle' };
      } else {
        // Não persegue titãs para muito longe do ponto de defesa.
        const t = sim.titan(b.order.titanId)!;
        if (Math.hypot(t.x - gx, t.y - gy) > S.defendRadius * 1.5 * ts) b.order = { type: 'move', tx: b.guard.tx, ty: b.guard.ty };
      }
    } else if (b.mode === 'hunt') {
      if (b.order.type !== 'attack') {
        const t = nearestTitan(sim, cpos.x, cpos.y, S.huntRadius * ts);
        if (t) {
          b.order = { type: 'attack', titanId: t.id };
        } else {
          const reached = b.patrol && Math.hypot(cpos.x - (b.patrol.tx + 0.5) * ts, cpos.y - (b.patrol.ty + 0.5) * ts) < 2 * ts;
          if (!b.patrol || reached || (b.order.type === 'idle' && c.order.type === 'idle')) b.patrol = pickPatrolPoint(sim);
          if (b.patrol) b.order = { type: 'move', tx: b.patrol.tx, ty: b.patrol.ty };
        }
      }
    }

    applyOrder(sim, b, c, units);
  }
}

// Marcha até o hospital; quando todos estão perto e há leitos para todos, entram juntos.
function updateHospitalMarch(sim: Sim, b: Battalion, c: Unit, units: Unit[]): void {
  const o = b.order as Extract<Battalion['order'], { type: 'hospital' }>;
  const h = sim.building(o.buildingId);
  if (!h || !h.built) {
    b.order = { type: 'idle' };
    return;
  }
  const ts = sim.tileSize;
  const slowest = Math.min(...units.map((u) => UNIT_DEFS[u.kind].speed));
  for (const u of units) u.speedCap = u === c ? slowest : 0;
  const size = BUILDING_DEFS[h.kind].size;
  const hx = (h.tx + size / 2) * ts;
  const hy = (h.ty + size / 2) * ts;
  for (const m of units) {
    if (m !== c && m.order.type !== 'follow') {
      m.order = { type: 'follow' };
      clearPath(m);
    }
  }
  const nearDoor = Math.hypot(c.x - hx, c.y - hy) <= (size / 2 + 1.6) * ts;
  if (!nearDoor) {
    // O comandante só se aproxima (até o tile livre mais próximo em volta do hospital):
    // quem decide a entrada é o batalhão inteiro, abaixo.
    let best: { tx: number; ty: number } | null = null;
    let bestD = Infinity;
    for (let y = h.ty - 1; y <= h.ty + size; y++) {
      for (let x = h.tx - 1; x <= h.tx + size; x++) {
        if (!sim.nav.isFree(x, y)) continue;
        const d = Math.hypot((x + 0.5) * ts - c.x, (y + 0.5) * ts - c.y);
        if (d < bestD) {
          bestD = d;
          best = { tx: x, ty: y };
        }
      }
    }
    if (best && (c.order.type !== 'move' || c.order.tx !== best.tx || c.order.ty !== best.ty)) {
      if (c.order.type !== 'move' || c.path.length === 0) {
        c.order = { type: 'move', tx: best.tx, ty: best.ty };
        clearPath(c);
      }
    }
    return;
  }
  if (c.order.type !== 'idle') {
    c.order = { type: 'idle' };
    clearPath(c);
  }
  const together = units.every((u) => Math.hypot(u.x - c.x, u.y - c.y) <= BALANCE.hospital.groupRadius * ts);
  if (!together || freeBeds(sim, h, b.id) < units.length) return;
  for (const u of units) {
    u.garrison = h.id;
    u.x = hx;
    u.y = hy;
    u.order = { type: 'idle' };
    u.speedCap = 0;
    clearPath(u);
  }
  b.inHospital = h.id;
  b.order = { type: 'idle' };
  addLog(sim.state, `${b.name} foi internado no hospital.`);
}

function applyOrder(sim: Sim, b: Battalion, c: Unit, units: Unit[]): void {
  const o = b.order;
  if (o.type === 'attack') {
    for (const u of units) {
      if (u.order.type !== 'attack' || u.order.titanId !== o.titanId) {
        u.order = { type: 'attack', titanId: o.titanId };
        clearPath(u);
      }
    }
    return;
  }
  for (const m of units) {
    if (m === c) continue;
    if (m.order.type !== 'follow') {
      m.order = { type: 'follow' };
      clearPath(m);
    }
  }
  if (o.type === 'move') {
    if (c.order.type !== 'move' || c.order.tx !== o.tx || c.order.ty !== o.ty) {
      // O comandante pode ter acabado de chegar (ficou ocioso): no modo manual, a ordem termina.
      if (c.order.type === 'idle' && c.path.length === 0 && Math.floor(c.x / sim.tileSize) === o.tx && Math.floor(c.y / sim.tileSize) === o.ty) {
        if (b.mode === 'manual') b.order = { type: 'idle' };
        return;
      }
      c.order = { type: 'move', tx: o.tx, ty: o.ty };
      clearPath(c);
    }
  } else if (c.order.type !== 'idle') {
    c.order = { type: 'idle' };
    clearPath(c);
  }
}

import { BALANCE } from '../data/balance';
import { UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { addLog } from '../state';
import type { Battalion, BattalionMode, Unit } from '../entities/types';
import { clearPath, moveTo, stepToward } from './movement';
import { titanAt } from './commands';
import { isSoldier } from './soldiers';
import { nearestTitan } from './combat';

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
  const titanId = titanAt(sim, wx, wy);
  if (titanId !== null) b.order = { type: 'attack', titanId };
  else b.order = { type: 'move', tx: Math.floor(wx / sim.tileSize), ty: Math.floor(wy / sim.tileSize) };
}

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

export function updateBattalions(sim: Sim): void {
  const s = sim.state;
  const ts = sim.tileSize;
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
      enforceCapacity(sim, b);
      addLog(s, `${next.name} assumiu o comando do ${b.name}.`);
      c = next;
      c.order = { type: 'idle' };
      clearPath(c);
    }
    const units = battalionUnits(sim, b);
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

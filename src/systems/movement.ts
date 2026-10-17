import { BALANCE } from '../data/balance';
import { UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import type { Unit } from '../entities/types';
import { findPath, goalKey, satisfies, smoothPath, type Goal } from '../world/pathfinding';
import { unitTile } from './queries';

const DT = 1 / BALANCE.time.ticksPerSecond;

export type MoveResult = 'moving' | 'arrived' | 'unreachable';

export function clearPath(u: Unit): void {
  u.path = [];
  u.pathKey = '';
  u.pathComplete = true;
  u.moving = false;
}

export interface MoveOptions {
  maxExpand?: number; // limite de tiles explorados pela busca (destinos inalcançáveis param mais cedo)
  repathTicks?: number; // intervalo mínimo entre recálculos (alvos que se movem, como titãs)
}

// Move a unidade em direção ao destino, calculando (ou recalculando) o caminho quando preciso.
export function moveTo(sim: Sim, u: Unit, goal: Goal, opts: MoveOptions = {}): MoveResult {
  const ts = sim.tileSize;
  const { tx, ty } = unitTile(sim, u);
  const key = goalKey(goal);

  if (goal.adjacent && satisfies(sim.nav, goal, tx, ty)) {
    clearPath(u);
    return 'arrived';
  }

  if (u.pathKey !== key) {
    const last = sim.lastRepath.get(u.id) ?? -Infinity;
    if (opts.repathTicks && sim.state.tick - last < opts.repathTicks) {
      // Recalculou há pouco: segue o caminho antigo (ou espera) em vez de buscar de novo.
      if (u.path.length === 0) {
        u.moving = false;
        return 'moving';
      }
    } else {
      const res = findPath(sim.nav, tx, ty, goal, opts.maxExpand);
      u.path = smoothPath(sim.nav, u.x / ts, u.y / ts, res.tiles);
      u.pathKey = key;
      u.pathComplete = res.complete;
      sim.lastRepath.set(u.id, sim.state.tick);
    }
  }

  if (u.path.length === 0) {
    if (!goal.adjacent && u.pathComplete) {
      // Chegou ao tile de destino: termina no centro dele.
      const cx = (goal.x0 + 0.5) * ts;
      const cy = (goal.y0 + 0.5) * ts;
      if (stepToward(u, cx, cy)) {
        // Mantém a chave do caminho: parado no destino, não precisa buscar de novo a cada passo.
        u.path = [];
        u.moving = false;
        return 'arrived';
      }
      return 'moving';
    }
    // Atenção: guardar antes de limpar (clearPath marca o caminho como completo).
    const complete = u.pathComplete;
    clearPath(u);
    return complete ? 'arrived' : 'unreachable';
  }

  const w = sim.nav.width;
  const next = u.path[0];
  const nx = next % w;
  const ny = (next - nx) / w;
  // O caminho ficou bloqueado (ex.: um edifício foi construído nele): recalcula no próximo passo.
  if (!sim.nav.isFree(nx, ny)) {
    u.pathKey = '';
    return 'moving';
  }
  // Fim de um caminho incompleto (só chega perto do destino): entrar no tile basta. Ir até o centro
  // dele pode ser impossível com outros aldeões parados ali, e eles ficariam se empurrando sem fim.
  if (u.path.length === 1 && !u.pathComplete && nx === tx && ny === ty) {
    u.path.shift();
    return 'moving';
  }
  if (stepToward(u, (nx + 0.5) * ts, (ny + 0.5) * ts)) u.path.shift();
  return 'moving';
}

// Anda um passo em direção ao ponto. Retorna true se chegou.
export function stepToward(
  u: { x: number; y: number; facing: number; moving?: boolean; kind?: string; speedCap?: number; speedBonus?: number },
  x: number,
  y: number,
  speed?: number,
): boolean {
  let base = speed ?? UNIT_DEFS[u.kind as Unit['kind']].speed * (1 + (u.speedBonus ?? 0));
  if (speed === undefined && u.speedCap) base = Math.min(base, u.speedCap);
  const step = base * DT;
  const dx = x - u.x;
  const dy = y - u.y;
  const d = Math.hypot(dx, dy);
  if ('moving' in u) u.moving = true;
  if (d <= step) {
    u.x = x;
    u.y = y;
    return true;
  }
  u.facing = Math.atan2(dy, dx);
  u.x += (dx / d) * step;
  u.y += (dy / d) * step;
  return false;
}

export function face(u: Unit, x: number, y: number): void {
  u.facing = Math.atan2(y - u.y, x - u.x);
}

// Afasta unidades sobrepostas e tira unidades de dentro de tiles bloqueados
// (por exemplo, quando um edifício é colocado em cima delas).
export function separateUnits(sim: Sim): void {
  const ts = sim.tileSize;
  const cell = 24;
  const grid = new Map<number, Unit[]>();
  const key = (cx: number, cy: number) => cy * 4096 + cx;
  for (const u of sim.state.units) {
    if (u.garrison) continue;
    const k = key(Math.floor(u.x / cell), Math.floor(u.y / cell));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(u);
  }
  for (const u of sim.state.units) {
    if (u.garrison) continue;
    const { tx, ty } = unitTile(sim, u);
    if (!sim.nav.isFree(tx, ty)) {
      pushOutOfBlocked(sim, u, tx, ty);
      continue;
    }
    const working = isWorking(u);
    if (working) continue;
    const r1 = UNIT_DEFS[u.kind].radius;
    const cx = Math.floor(u.x / cell);
    const cy = Math.floor(u.y / cell);
    let px = 0;
    let py = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        for (const o of grid.get(key(cx + ox, cy + oy)) ?? []) {
          if (o === u) continue;
          const min = r1 + UNIT_DEFS[o.kind].radius;
          let dx = u.x - o.x;
          let dy = u.y - o.y;
          let d = Math.hypot(dx, dy);
          if (d >= min) continue;
          if (d < 0.01) {
            // Mesma posição: separa numa direção determinística.
            dx = Math.cos(u.id);
            dy = Math.sin(u.id);
            d = 1;
          }
          const push = (min - d) * (u.moving ? 0.15 : 0.35);
          if (!u.moving && o.moving) {
            // Quem está parado dá um passo para o lado (em vez de ser empurrado pelo caminho todo).
            const sx = -Math.sin(o.facing);
            const sy = Math.cos(o.facing);
            const side = dx * sx + dy * sy >= 0 ? 1 : -1;
            px += sx * side * push;
            py += sy * side * push;
          } else {
            px += (dx / d) * push;
            py += (dy / d) * push;
          }
        }
      }
    }
    if (px || py) {
      const nx = u.x + Math.max(-2, Math.min(2, px));
      const ny = u.y + Math.max(-2, Math.min(2, py));
      if (sim.nav.isFree(Math.floor(nx / ts), Math.floor(ny / ts))) {
        u.x = nx;
        u.y = ny;
      }
    }
  }
}

function isWorking(u: Unit): boolean {
  return !u.moving && (u.order.type === 'gather' || u.order.type === 'farm' || u.order.type === 'build' || u.order.type === 'attack');
}

function pushOutOfBlocked(sim: Sim, u: Unit, tx: number, ty: number): void {
  const ts = sim.tileSize;
  for (let r = 1; r <= 6; r++) {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = ty - r; y <= ty + r; y++) {
      for (let x = tx - r; x <= tx + r; x++) {
        if (!sim.nav.isFree(x, y)) continue;
        const cx = (x + 0.5) * ts;
        const cy = (y + 0.5) * ts;
        const d = (cx - u.x) ** 2 + (cy - u.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: cx, y: cy };
        }
      }
    }
    if (best) {
      const dx = best.x - u.x;
      const dy = best.y - u.y;
      const d = Math.hypot(dx, dy);
      const step = Math.min(d, 4);
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
      return;
    }
  }
}

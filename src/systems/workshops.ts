import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { getClock } from '../core/time';
import type { Building, ResourceKind, Unit, UnitOrder } from '../entities/types';
import { moveTo } from './movement';
import { workSpeed } from './modifiers';

// Oficinas da Era II (pasto, padaria, tecelagem): um aldeão trabalha em cada uma e a produção vai
// direto para o estoque, consumindo a matéria-prima (comida vira pão, lã vira roupas).

const DT = 1 / BALANCE.time.ticksPerSecond;
type WorkOrder = Extract<UnitOrder, { type: 'work' }>;

export function isWorkshop(b: Building): boolean {
  return b.kind in BALANCE.workshops;
}

export function workshopRecipe(b: Building) {
  return BALANCE.workshops[b.kind];
}

// O trabalhador atual (guardado em farmerId), se ainda estiver com a ordem de trabalhar aqui.
export function workerOf(sim: Sim, b: Building): Unit | undefined {
  if (!b.farmerId) return undefined;
  const u = sim.unit(b.farmerId);
  return u && u.order.type === 'work' && u.order.buildingId === b.id ? u : undefined;
}

// Clique direito numa oficina com aldeões: o primeiro livre vira o trabalhador. Retorna erro ou null.
export function commandWork(sim: Sim, ids: readonly number[], buildingId: number): string | null {
  const b = sim.building(buildingId);
  if (!b || !b.built || !isWorkshop(b)) return 'Oficina indisponível.';
  if (workerOf(sim, b)) return `${BUILDING_DEFS[b.kind].name} já tem trabalhador.`;
  const u = ids.map((id) => sim.unit(id)).find((x): x is Unit => !!x && UNIT_DEFS[x.kind].canGather);
  if (!u) return null;
  b.farmerId = u.id;
  u.order = { type: 'work', buildingId: b.id };
  u.path = [];
  u.pathKey = '';
  return null;
}

// Anda até a oficina e fica lá. Retorna false se a oficina sumiu ou foi ocupada por outro.
export function updateWorkOrder(sim: Sim, u: Unit, o: WorkOrder): boolean {
  const b = sim.building(o.buildingId);
  if (!b || !b.built) return false;
  if (b.farmerId && b.farmerId !== u.id && workerOf(sim, b)) return false;
  b.farmerId = u.id;
  const s = BUILDING_DEFS[b.kind].size;
  // Pasto: o pastor fica no meio das ovelhas; oficinas: na porta.
  const goal = BUILDING_DEFS[b.kind].walkable
    ? { x0: b.tx + 1, y0: b.ty + 1, x1: b.tx + s - 2, y1: b.ty + s - 2, adjacent: false }
    : { x0: b.tx, y0: b.ty, x1: b.tx + s - 1, y1: b.ty + s - 1, adjacent: true };
  const r = moveTo(sim, u, goal);
  if (r === 'unreachable') return false;
  if (r === 'moving') return true;
  u.moving = false;
  return true;
}

// O trabalhador está no posto (chegou e está parado)?
function atPost(u: Unit): boolean {
  return !u.moving && u.path.length === 0;
}

function canPay(sim: Sim, input: Partial<Record<ResourceKind, number>>): boolean {
  return (Object.entries(input) as [ResourceKind, number][]).every(([k, v]) => sim.state.resources[k] >= v);
}

// Por que a oficina está parada (para o painel). Vazio = produzindo.
export function workshopProblem(sim: Sim, b: Building): string {
  const w = workerOf(sim, b);
  if (!w) return 'Sem trabalhador: clique com o botão direito com um aldeão.';
  if (!atPost(w)) return 'O trabalhador está a caminho.';
  const r = workshopRecipe(b);
  if (!canPay(sim, r.input)) return `Falta ${Object.keys(r.input).map((k) => ({ food: 'comida', wool: 'lã' })[k as 'food' | 'wool']).join(' e ')} no estoque.`;
  if (b.kind === 'bakery' && sim.state.city.starving) return 'A vila passa fome: a comida não vai para o forno.';
  return '';
}

export function updateWorkshops(sim: Sim): void {
  const s = sim.state;
  const winter = getClock(s.tick).seasonIndex === 3;
  const speed = workSpeed(s);
  for (const b of s.buildings) {
    if (!b.built || !isWorkshop(b)) continue;
    if (workshopProblem(sim, b)) continue;
    const r = workshopRecipe(b);
    const seasonal = b.kind === 'pasture' && winter ? BALANCE.pastureWinterFactor : 1;
    b.produce += DT * speed * seasonal;
    if (b.produce < r.seconds) continue;
    b.produce -= r.seconds;
    for (const [k, v] of Object.entries(r.input) as [ResourceKind, number][]) s.resources[k] -= v;
    for (const [k, v] of Object.entries(r.output) as [ResourceKind, number][]) {
      s.resources[k] += v;
      s.stats.gathered[k] += v;
    }
  }
}

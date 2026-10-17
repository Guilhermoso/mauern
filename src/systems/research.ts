import { BALANCE } from '../data/balance';
import { TECH_DEFS, TECH_IDS, type TechId } from '../data/techs';
import type { Sim } from '../core/sim';
import { addLog } from '../state';
import type { Building } from '../entities/types';
import { canAfford, pay, refund } from './commands';
import { mult, unitMaxHp } from './modifiers';

const DT = 1 / BALANCE.time.ticksPerSecond;

// Tecnologias que podem ser pesquisadas neste edifício agora (ou já em pesquisa em outro lugar).
export function availableTechs(sim: Sim, b: Building): TechId[] {
  const s = sim.state;
  const busy = new Set(s.buildings.map((x) => x.research?.tech).filter(Boolean));
  return TECH_IDS.filter((id) => {
    const t = TECH_DEFS[id];
    return t.building === b.kind && t.era <= s.era && !s.techs.includes(id) && !busy.has(id) && (t.requires ?? []).every((r) => s.techs.includes(r));
  });
}

export function startResearch(sim: Sim, buildingId: number, tech: TechId): string | null {
  const b = sim.building(buildingId);
  if (!b || !b.built) return 'Edifício indisponível.';
  if (b.research) return 'Este edifício já está pesquisando.';
  if (!availableTechs(sim, b).includes(tech)) return 'Tecnologia indisponível.';
  const def = TECH_DEFS[tech];
  if (!canAfford(sim, def.cost)) return 'Recursos insuficientes.';
  pay(sim, def.cost);
  b.research = { tech, progress: 0 };
  return null;
}

export function cancelResearch(sim: Sim, buildingId: number): void {
  const b = sim.building(buildingId);
  if (!b?.research) return;
  refund(sim, TECH_DEFS[b.research.tech as TechId].cost);
  b.research = null;
}

export function updateResearch(sim: Sim): void {
  const s = sim.state;
  const speed = mult(s, 'research');
  for (const b of s.buildings) {
    if (!b.research || !b.built) continue;
    const def = TECH_DEFS[b.research.tech as TechId];
    b.research.progress += DT * speed;
    if (b.research.progress < def.time) continue;
    const id = b.research.tech as TechId;
    b.research = null;
    // Unidades existentes recebem o bônus de vida na hora.
    const before = new Map(s.units.map((u) => [u.id, unitMaxHp(s, u)]));
    s.techs.push(id);
    for (const u of s.units) u.hp += unitMaxHp(s, u) - (before.get(u.id) ?? 0);
    const text = `Pesquisa concluída: ${def.name}. ${def.description}`;
    addLog(s, text);
    sim.alerts.push({ kind: 'research', text, x: 0, y: 0 });
  }
}

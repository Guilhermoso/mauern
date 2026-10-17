import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import type { Building } from '../entities/types';

// Portões abrem sozinhos quando um morador passa e ficam abertos por alguns segundos.
// Aberto, o portão deixa de ser barreira: um titã por perto pode entrar. É o risco de sair dos muros.

export function isGateOpen(sim: Sim, b: Building): boolean {
  return BUILDING_DEFS[b.kind].gate === true && (sim.gateOpenUntil.get(b.id) ?? -1) > sim.state.tick;
}

export function updateGates(sim: Sim): void {
  const s = sim.state;
  if (s.tick % 5 !== 0) return;
  const ts = sim.tileSize;
  const hold = Math.round(BALANCE.titans.gateOpenSeconds * BALANCE.time.ticksPerSecond);
  for (const b of s.buildings) {
    if (!BUILDING_DEFS[b.kind].gate || !b.built) continue;
    const cx = (b.tx + 0.5) * ts;
    const cy = (b.ty + 0.5) * ts;
    // Alguém atravessando (ou bem na frente): abre.
    if (s.units.some((u) => !u.garrison && Math.abs(u.x - cx) < ts * 1.1 && Math.abs(u.y - cy) < ts * 1.1)) {
      sim.gateOpenUntil.set(b.id, s.tick + hold);
    }
  }
  for (const id of sim.gateOpenUntil.keys()) if (!sim.building(id)) sim.gateOpenUntil.delete(id);
}

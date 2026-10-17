import type { Sim } from './sim';
import { addLog } from '../state';
import { getClock } from './time';
import { updateUnits } from '../systems/units';
import { updateProduction } from '../systems/production';
import { updateThreat, updateTitans } from '../systems/titans';
import { updateBuildingAttacks } from '../systems/combat';
import { updateCity } from '../systems/city';
import { updateResearch } from '../systems/research';
import { updateEvents } from '../systems/events';

// Um passo fixo da simulação. Não depende da renderização.
export function step(sim: Sim): void {
  const state = sim.state;
  const before = getClock(state.tick);
  state.tick++;
  const after = getClock(state.tick);

  updateThreat(sim);
  updateProduction(sim);
  updateUnits(sim);
  updateTitans(sim);
  updateBuildingAttacks(sim);
  updateResearch(sim);
  updateCity(sim);
  updateEvents(sim);
  sim.syncRng();

  if (after.day !== before.day) {
    const seasonChanged = after.seasonIndex !== before.seasonIndex;
    addLog(state, `Dia ${after.day} amanhece${seasonChanged ? ` — começa ${after.season === 'Verão' ? 'o' : 'a'} ${after.season}` : ''}.`);
  }
}

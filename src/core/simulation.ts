import type { GameState } from '../state';
import { addLog } from '../state';
import { getClock } from './time';

// Um passo fixo da simulação. Não depende da renderização.
export function step(state: GameState): void {
  const before = getClock(state.tick);
  state.tick++;
  const after = getClock(state.tick);

  if (after.day !== before.day) {
    const seasonChanged = after.seasonIndex !== before.seasonIndex;
    addLog(state, `Dia ${after.day} amanhece${seasonChanged ? ` — começa ${after.season === 'Verão' ? 'o' : 'a'} ${after.season}` : ''}.`);
  }
}

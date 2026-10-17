import { BALANCE } from '../data/balance';
import { UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { addLog } from '../state';
import type { Unit } from '../entities/types';
import type { Cost } from '../data/defs';
import { isFemaleName } from '../entities/names';
import { canAfford, pay } from './commands';
import { addMoraleMod } from './damage';
import { buffFraction, invalidateNotables, levelBonusOf, notableUnits, shieldInfo } from './modifiers';

const N = BALANCE.nobility;
const L = BALANCE.legend;
const TPS = BALANCE.time.ticksPerSecond;

// Nobreza, lendas e seus efeitos que não são bônus de vida/ataque (esses ficam em modifiers.ts):
// intimidação dos titãs, escudos e o soldo diário dos nobres.

// Custo do próximo título: cresce com o número de nobres vivos.
export function nobleCost(sim: Sim): Cost {
  return { gold: N.costStep * (notableUnits(sim.state).nobles.length + 1) };
}

export function canEnnoble(u: Unit): boolean {
  return UNIT_DEFS[u.kind].military && !u.noble && u.level >= N.minLevel;
}

// Concede o título de nobreza. Retorna erro ou null.
export function ennoble(sim: Sim, unitId: number): string | null {
  const u = sim.unit(unitId);
  if (!u || !UNIT_DEFS[u.kind].military) return 'Só militares recebem títulos.';
  if (u.noble) return 'Já é nobre.';
  if (u.level < N.minLevel) return `Exige nível ${N.minLevel}.`;
  const cost = nobleCost(sim);
  if (!canAfford(sim, cost)) return `Ouro insuficiente (o próximo título custa ${cost.gold}).`;
  pay(sim, cost);
  // A vida base extra entra já curada (os bônus percentuais são ajustados em proporção depois).
  u.hp += N.extraHp * levelBonusOf(u) * (1 + buffFraction(sim.state, u));
  u.noble = true;
  invalidateNotables(sim.state);
  const f = isFemaleName(u.name);
  const text = `${u.name} recebeu o título de ${f ? 'nobre dama' : 'nobre cavaleiro'}.`;
  addLog(sim.state, text);
  sim.alerts.push({ kind: 'promotion', text, x: u.x, y: u.y });
  return null;
}

// Soldo diário dos nobres. Sem ouro, os nobres reclamam e a moral cai.
export function payNobles(sim: Sim): void {
  const n = notableUnits(sim.state).nobles.length;
  if (!n) return;
  const due = n * N.upkeepGold;
  const r = sim.state.resources;
  if (r.gold >= due) {
    r.gold -= due;
    return;
  }
  r.gold = 0;
  addMoraleMod(sim, 'Nobres sem soldo', N.unpaidMorale, 24);
  addLog(sim.state, `Faltou ouro para o soldo dos nobres (${due} por dia).`);
}

// Titãs perto de uma lenda (fora de edifícios) ficam intimidados.
function updateIntimidation(sim: Sim): void {
  sim.intimidated.clear();
  const legends = notableUnits(sim.state).legends.filter((l) => !l.garrison);
  if (!legends.length) return;
  const r = L.radius * sim.tileSize;
  for (const t of sim.state.titans) {
    if (legends.some((l) => Math.hypot(l.x - t.x, l.y - t.y) <= r)) sim.intimidated.add(t.id);
  }
}

// Escudos recarregam por completo depois de um tempo fora de combate.
function updateShields(sim: Sim): void {
  const tick = sim.state.tick;
  for (const u of sim.state.units) {
    if (!UNIT_DEFS[u.kind].military) continue;
    const { max, recharge } = shieldInfo(sim.state, u);
    if (max <= 0) {
      u.shield = 0;
      continue;
    }
    if (tick - u.lastCombatTick >= recharge * TPS) u.shield = max;
    else if (u.shield > max) u.shield = max;
  }
}

export function updateValor(sim: Sim): void {
  updateIntimidation(sim);
  updateShields(sim);
}

// Multiplicadores para titãs intimidados.
export function titanDamageFactor(sim: Sim, titanId: number): number {
  return sim.intimidated.has(titanId) ? 1 - L.titanDamageReduction : 1;
}

export function damageToTitanFactor(sim: Sim, titanId: number): number {
  return sim.intimidated.has(titanId) ? 1 / (1 - L.titanHpReduction) : 1;
}

import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import { CHRONICLES, CHRONICLE_IDS } from '../data/chronicles';
import type { Sim } from '../core/sim';
import { getClock, ticksPerDay } from '../core/time';
import { addLog } from '../state';
import type { Building } from '../entities/types';
import { flat, mult } from './modifiers';
import { addMoraleMod } from './damage';

const C = BALANCE.city;
const M = BALANCE.morale;
export const TICKS_PER_HOUR = ticksPerDay() / 24;

// --- Cobertura de serviços (poço, fogueira) ---

function center(b: Building): { x: number; y: number } {
  const s = BUILDING_DEFS[b.kind].size;
  return { x: b.tx + s / 2, y: b.ty + s / 2 };
}

export function serviceRadius(sim: Sim, kind: 'well' | 'bonfire'): number {
  return kind === 'well' ? C.wellRadius + flat(sim.state, 'wellRadius') : C.bonfireRadius;
}

export function isCovered(sim: Sim, house: Building, kind: 'well' | 'bonfire'): boolean {
  const r = serviceRadius(sim, kind);
  const h = center(house);
  return sim.state.buildings.some((b) => {
    if (b.kind !== kind || !b.built) return false;
    const c = center(b);
    return Math.hypot(c.x - h.x, c.y - h.y) <= r;
  });
}

// Necessidades de cada nível de casa. Retorna a lista do que falta (vazia = tudo atendido).
export function missingNeeds(sim: Sim, house: Building, level: number): string[] {
  const out: string[] = [];
  if (level >= 2) {
    if (sim.state.city.starving) out.push('comida');
    if (!isCovered(sim, house, 'well')) out.push('água (poço por perto)');
  }
  if (level >= 3) {
    if (!isCovered(sim, house, 'bonfire')) out.push('fogueira comunitária por perto');
    if (sim.state.morale < C.level3Morale) out.push(`moral ${C.level3Morale} ou mais`);
  }
  return out;
}

function updateHouses(sim: Sim): void {
  const s = sim.state;
  for (const b of s.buildings) {
    if (b.kind !== 'house' || !b.built) continue;
    // Regride se perdeu algo que o nível atual exige.
    if (missingNeeds(sim, b, b.level).length) {
      b.missingHours++;
      b.needHours = 0;
      if (b.missingHours >= C.downgradeHours && b.level > 1) {
        b.level--;
        b.missingHours = 0;
      }
      continue;
    }
    b.missingHours = 0;
    if (b.level >= 3) continue;
    const next = b.level + 1;
    const stoneOk = next < 3 || s.resources.stone >= C.level3StoneCost;
    if (missingNeeds(sim, b, next).length === 0 && stoneOk) {
      b.needHours++;
      if (b.needHours >= C.upgradeHours) {
        if (next === 3) s.resources.stone -= C.level3StoneCost;
        b.level = next;
        b.needHours = 0;
      }
    } else {
      b.needHours = 0;
    }
  }
}

// --- Consumo, impostos e moral (a cada hora de jogo) ---

export function foodPerDay(sim: Sim): number {
  return sim.state.units.length * C.foodPerPersonPerDay * mult(sim.state, 'foodUse');
}

export function winterWoodPerDay(sim: Sim): number {
  const levels = sim.state.buildings.reduce((n, b) => n + (b.kind === 'house' && b.built ? b.level : 0), 0);
  return levels * C.winterWoodPerHouseLevel * mult(sim.state, 'winterWood');
}

export function taxesPerDay(sim: Sim): number {
  const sum = sim.state.buildings.reduce((n, b) => n + (b.kind === 'house' && b.built ? C.houseTaxPerDay[b.level - 1] : 0), 0);
  return sum * mult(sim.state, 'taxes');
}

export interface MoraleBreakdown {
  target: number;
  parts: { label: string; value: number }[];
}

export function moraleTarget(sim: Sim): MoraleBreakdown {
  const s = sim.state;
  const parts: { label: string; value: number }[] = [{ label: 'Base', value: M.base }];
  if (s.city.starving) parts.push({ label: 'Fome', value: M.starving });
  else if (s.resources.food >= foodPerDay(sim) * 2) parts.push({ label: 'Comida farta', value: M.wellFed });
  if (s.city.cold) parts.push({ label: 'Frio (falta lenha)', value: M.cold });
  const houses = s.buildings.filter((b) => b.kind === 'house' && b.built);
  if (houses.length) {
    const avg = houses.reduce((n, b) => n + b.level, 0) / houses.length;
    if (avg > 1) parts.push({ label: 'Qualidade das casas', value: Math.round((avg - 1) * M.perHouseLevel) });
    const covered = houses.filter((h) => isCovered(sim, h, 'bonfire')).length / houses.length;
    if (covered > 0) parts.push({ label: 'Fogueiras', value: Math.round(covered * M.bonfireCoverage) });
  }
  const relic = flat(s, 'morale');
  if (relic) parts.push({ label: 'Relíquias', value: relic });
  // Acontecimentos recentes (mortes, titãs abatidos, festivais...), somados por motivo.
  const byReason = new Map<string, number>();
  for (const m of s.moraleMods) byReason.set(m.reason, (byReason.get(m.reason) ?? 0) + m.value);
  for (const [label, v] of byReason) {
    const value = Math.max(-M.modifierCap, Math.min(M.modifierCap, Math.round(v)));
    if (value) parts.push({ label, value });
  }
  const target = Math.max(0, Math.min(100, parts.reduce((n, p) => n + p.value, 0)));
  return { target, parts };
}

function hourly(sim: Sim): void {
  const s = sim.state;
  const clock = getClock(s.tick);

  // Comida
  const food = foodPerDay(sim) / 24;
  s.city.starving = s.resources.food < food;
  s.resources.food = Math.max(0, s.resources.food - food);
  if (s.city.starving && clock.seasonIndex === 3) s.city.hungerThisWinter = true;
  if (s.city.starving && clock.hour === 8) addLog(s, 'Falta comida! A população passa fome.');

  // Lenha no inverno
  if (clock.seasonIndex === 3) {
    const wood = winterWoodPerDay(sim) / 24;
    s.city.cold = s.resources.wood < wood;
    s.resources.wood = Math.max(0, s.resources.wood - wood);
    if (s.city.cold && clock.hour === 8) addLog(s, 'Falta lenha! As casas estão geladas.');
  } else {
    s.city.cold = false;
  }

  // Impostos
  s.city.taxCarry += taxesPerDay(sim) / 24;
  const whole = Math.floor(s.city.taxCarry);
  s.resources.gold += whole;
  s.city.taxCarry -= whole;

  updateHouses(sim);

  // Moral
  s.moraleMods = s.moraleMods.filter((m) => m.expiresTick > s.tick);
  const { target } = moraleTarget(sim);
  const step = M.changePerHour;
  s.morale = s.morale < target ? Math.min(target, s.morale + step) : Math.max(target, s.morale - step);
  s.stats.moraleHighHours = s.morale >= 80 ? s.stats.moraleHighHours + 1 : 0;

  checkHorde(sim);
  checkChronicles(sim);
}

// Uma horda é "repelida" quando todos os seus titãs foram abatidos.
function checkHorde(sim: Sim): void {
  const st = sim.state.stats;
  if (st.hordeDeathsAtStart < 0 || sim.state.titans.some((t) => t.horde)) return;
  st.greatAttacksRepelled++;
  const flawless = st.deaths === st.hordeDeathsAtStart;
  if (flawless) st.flawlessHordes++;
  st.hordeDeathsAtStart = -1;
  addMoraleMod(sim, 'Grande Ataque repelido', M.hordeRepelledBonus, 48);
  const text = flawless ? 'O Grande Ataque foi repelido sem nenhuma perda!' : 'O Grande Ataque foi repelido!';
  addLog(sim.state, text);
  sim.alerts.push({ kind: 'victory', text, x: 0, y: 0 });
}

export function checkChronicles(sim: Sim): void {
  const s = sim.state;
  for (const id of CHRONICLE_IDS) {
    const c = CHRONICLES[id];
    if (c.era > s.era || s.relics.includes(id) || !c.check(s)) continue;
    s.relics.push(id);
    const text = `Crônica cumprida: “${c.name}”. Relíquia obtida: ${c.relic} — ${c.relicDescription}`;
    addLog(s, text);
    sim.alerts.push({ kind: 'chronicle', text, x: 0, y: 0 });
  }
}

export function updateCity(sim: Sim): void {
  const s = sim.state;
  const before = getClock(s.tick - 1);
  const now = getClock(s.tick);
  if (now.seasonIndex !== before.seasonIndex) {
    if (now.seasonIndex === 3) {
      s.city.hungerThisWinter = false;
      addLog(s, 'O inverno chegou: as fazendas param e as casas precisam de lenha.');
    }
    if (before.seasonIndex === 3) {
      s.stats.wintersSurvived++;
      if (!s.city.hungerThisWinter) s.stats.wintersWithoutHunger++;
    }
  }
  if (s.tick % TICKS_PER_HOUR === 0) hourly(sim);
}

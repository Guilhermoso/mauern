import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import { CHRONICLES } from '../data/chronicles';
import { MAX_LEVEL } from '../data/ranks';
import { TECH_DEFS, type Effects, type ModKey, type TechId } from '../data/techs';
import type { GameState } from '../state';
import type { Building, Unit } from '../entities/types';

// Soma os efeitos das tecnologias pesquisadas e das relíquias conquistadas.
// O resultado fica em cache e só é recalculado quando a lista muda.

const cache = new WeakMap<GameState, { key: string; mods: Effects }>();

export function getMods(state: GameState): Effects {
  const key = `${state.techs.join(',')}|${state.relics.join(',')}`;
  const hit = cache.get(state);
  if (hit && hit.key === key) return hit.mods;
  const mods: Effects = {};
  const add = (e: Effects) => {
    for (const [k, v] of Object.entries(e) as [ModKey, number][]) mods[k] = (mods[k] ?? 0) + v;
  };
  for (const t of state.techs) if (TECH_DEFS[t as TechId]) add(TECH_DEFS[t as TechId].effects);
  for (const r of state.relics) if (CHRONICLES[r]) add(CHRONICLES[r].effects);
  cache.set(state, { key, mods });
  return mods;
}

// Multiplicador (1 + soma dos bônus percentuais).
export function mult(state: GameState, key: ModKey): number {
  return Math.max(0, 1 + (getMods(state)[key] ?? 0));
}

// Bônus somado direto.
export function flat(state: GameState, key: ModKey): number {
  return getMods(state)[key] ?? 0;
}

export function hasTech(state: GameState, id: TechId): boolean {
  return state.techs.includes(id);
}

// Velocidade de trabalho conforme a moral (0 → 0,8×; 50 → 1×; 100 → 1,2×).
export function workSpeed(state: GameState): number {
  const m = BALANCE.morale;
  return m.workMin + (m.workMax - m.workMin) * (state.morale / 100);
}

export function buildingMaxHp(state: GameState, b: Building): number {
  const def = BUILDING_DEFS[b.kind];
  let hp = def.maxHp;
  if (def.wall || def.gate) hp *= mult(state, 'wallHp');
  if (b.kind === 'townCenter') hp *= mult(state, 'tcHp');
  return Math.round(hp);
}

// Soldados ficam mais fortes a cada nível de experiência.
function levelBonus(u: Unit, perLevel: number): number {
  return UNIT_DEFS[u.kind].military ? 1 + perLevel * ((u.level ?? 1) - 1) : 1;
}

export function levelBonusOf(u: Unit): number {
  return levelBonus(u, BALANCE.soldiers.hpPerLevel);
}

// Lenda: soldado no nível máximo.
export function isLegend(u: Unit): boolean {
  return UNIT_DEFS[u.kind].military && u.level >= MAX_LEVEL;
}

// Honras: uma a cada 10 titãs abatidos, até 10.
export function honors(u: Unit): number {
  const H = BALANCE.honor;
  return Math.min(H.max, Math.floor((u.kills ?? 0) / H.killsPerHonor));
}

export function honorBonus(u: Unit): number {
  const H = BALANCE.honor;
  const n = honors(u);
  return n >= H.max ? H.maxBonus : n * H.bonusPerHonor;
}

// Os dois estão no mesmo lugar: dentro do mesmo edifício, ou ambos fora e perto.
function together(a: Unit, b: Unit, radiusTiles: number): boolean {
  if (a.garrison || b.garrison) return !!a.garrison && a.garrison === b.garrison;
  return Math.hypot(a.x - b.x, a.y - b.y) <= radiusTiles * BALANCE.world.tileSize;
}

// Nobres e lendas do momento (poucos): recalculados uma vez por passo.
const notables = new WeakMap<GameState, { tick: number; len: number; nobles: Unit[]; legends: Unit[] }>();

export function notableUnits(state: GameState): { nobles: Unit[]; legends: Unit[] } {
  const hit = notables.get(state);
  if (hit && hit.tick === state.tick && hit.len === state.units.length) return hit;
  const nobles: Unit[] = [];
  const legends: Unit[] = [];
  for (const u of state.units) {
    if (!UNIT_DEFS[u.kind].military) continue;
    if (u.noble) nobles.push(u);
    if (u.level >= MAX_LEVEL) legends.push(u);
  }
  const out = { tick: state.tick, len: state.units.length, nobles, legends };
  notables.set(state, out);
  return out;
}

// Esquece o cache (depois de conceder um título, por exemplo).
export function invalidateNotables(state: GameState): void {
  notables.delete(state);
}

// Bônus de comando: membros de batalhão perto do comandante ficam mais fortes conforme o nível dele.
// Comandante nobre: +10% fixo, e ele mesmo recebe o bônus total. Retorna a fração extra (0,1 = +10%).
export function leadershipBonus(state: GameState, u: Unit): number {
  if (!u.battalion) return 0;
  const b = state.battalions.find((x) => x.id === u.battalion);
  if (!b) return 0;
  const S = BALANCE.soldiers;
  const N = BALANCE.nobility;
  if (b.commanderId === u.id) return u.noble ? u.level * S.leadershipPerLevel + N.leadershipBonus : 0;
  const c = state.units.find((x) => x.id === b.commanderId);
  if (!c || !together(u, c, S.leadershipRadius)) return 0;
  return c.level * S.leadershipPerLevel + (c.noble ? N.leadershipBonus : 0);
}

// Auras de nobres e lendas próximos (de outros: cada tipo de aura vale uma vez só).
export function auraBonus(state: GameState, u: Unit): { noble: number; legend: number } {
  if (!UNIT_DEFS[u.kind].military) return { noble: 0, legend: 0 };
  const { nobles, legends } = notableUnits(state);
  const N = BALANCE.nobility;
  const L = BALANCE.legend;
  return {
    noble: nobles.some((n) => n !== u && together(u, n, N.auraRadius)) ? N.auraBonus : 0,
    legend: legends.some((l) => l !== u && together(u, l, L.radius)) ? L.auraBonus : 0,
  };
}

// Soma de todos os bônus percentuais de vida e ataque. Eles se somam e valem sempre sobre os
// valores base (com o nível), nunca sobre valores já aumentados por outro bônus.
export function buffFraction(state: GameState, u: Unit): number {
  if (!UNIT_DEFS[u.kind].military) return 0;
  const a = auraBonus(state, u);
  return leadershipBonus(state, u) + a.noble + a.legend + honorBonus(u);
}

export function unitBaseHp(state: GameState, u: Unit): number {
  const extra = (u.kind === 'militia' ? flat(state, 'militiaHp') : 0) + (u.noble ? BALANCE.nobility.extraHp : 0);
  return (UNIT_DEFS[u.kind].maxHp + extra) * levelBonus(u, BALANCE.soldiers.hpPerLevel);
}

export function unitMaxHp(state: GameState, u: Unit): number {
  return Math.round(unitBaseHp(state, u) * (1 + buffFraction(state, u)));
}

export function unitAttack(state: GameState, u: Unit): number {
  const extra = (u.kind === 'militia' ? flat(state, 'militiaAttack') : 0) + (u.noble ? BALANCE.nobility.lanceDamage : 0);
  const base = (UNIT_DEFS[u.kind].attack + extra) * levelBonus(u, BALANCE.soldiers.attackPerLevel);
  return base * (1 + buffFraction(state, u));
}

// Escudo máximo: a lenda tem o seu; os militares no batalhão de uma lenda, um menor.
export function shieldInfo(state: GameState, u: Unit): { max: number; recharge: number } {
  const L = BALANCE.legend;
  if (isLegend(u)) return { max: L.shield, recharge: L.shieldRecharge };
  if (u.battalion && notableUnits(state).legends.some((l) => l !== u && l.battalion === u.battalion)) {
    return { max: L.battalionShield, recharge: L.battalionShieldRecharge };
  }
  return { max: 0, recharge: 0 };
}

export function carryCapacity(state: GameState, u: Unit): number {
  const base = UNIT_DEFS[u.kind].carryCapacity;
  return base > 0 ? base + flat(state, 'carry') : 0;
}

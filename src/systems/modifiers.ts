import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import { CHRONICLES } from '../data/chronicles';
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

export function unitMaxHp(state: GameState, u: Unit): number {
  return UNIT_DEFS[u.kind].maxHp + (u.kind === 'militia' ? flat(state, 'militiaHp') : 0);
}

export function unitAttack(state: GameState, u: Unit): number {
  return UNIT_DEFS[u.kind].attack + (u.kind === 'militia' ? flat(state, 'militiaAttack') : 0);
}

export function carryCapacity(state: GameState, u: Unit): number {
  const base = UNIT_DEFS[u.kind].carryCapacity;
  return base > 0 ? base + flat(state, 'carry') : 0;
}

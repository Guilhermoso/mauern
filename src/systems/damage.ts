import { BUILDING_DEFS, buildingMessage, unitNoun } from '../data/defs';
import { isFemaleName } from '../entities/names';
import type { Sim } from '../core/sim';
import { addLog } from '../state';
import type { Building, Titan, Unit } from '../entities/types';
import { BALANCE } from '../data/balance';
import { clearPath } from './movement';
import { getClock } from '../core/time';

// Dano, morte e destruição: funções compartilhadas por titãs, combate e comandos do jogador.

export function damageUnit(sim: Sim, u: Unit, amount: number, byTitan: boolean): void {
  u.lastCombatTick = sim.state.tick;
  // O escudo (lendas e seu batalhão) absorve o golpe primeiro.
  if (u.shield > 0) {
    const absorbed = Math.min(u.shield, amount);
    u.shield -= absorbed;
    amount -= absorbed;
  }
  u.hp -= amount;
  if (u.hp <= 0) killUnit(sim, u, byTitan ? ['devorado por um titã', 'devorada por um titã'] : ['morto', 'morta']);
}

// cause: [forma masculina, forma feminina]
export function killUnit(sim: Sim, u: Unit, cause: [string, string]): void {
  const i = sim.state.units.indexOf(u);
  if (i < 0) return;
  sim.state.units.splice(i, 1);
  sim.state.stats.deaths++;
  addMoraleMod(sim, 'Morte de um morador', BALANCE.morale.deathPenalty, 48);
  const f = isFemaleName(u.name);
  // Memorial: ninguém é esquecido.
  sim.state.memorial.push({
    name: u.name, kind: u.kind, day: getClock(sim.state.tick).day,
    cause: f ? cause[1] : cause[0], level: u.level, kills: u.kills, noble: u.noble,
  });
  if (u.noble) {
    addMoraleMod(sim, f ? 'Morte de uma nobre' : 'Morte de um nobre', BALANCE.nobility.deathMorale, 96);
    addLog(sim.state, `O povo está de luto: ${f ? 'a nobre' : 'o nobre'} ${u.name} caiu.`);
  }
  const text = `${f ? 'A' : 'O'} ${unitNoun(u.kind, f).toLowerCase()} ${u.name} foi ${f ? cause[1] : cause[0]}.`;
  addLog(sim.state, text);
  sim.alerts.push({ kind: 'death', text, x: u.x, y: u.y });
}

export function damageBuilding(sim: Sim, b: Building, amount: number): void {
  b.hp -= amount;
  if (b.hp <= 0) {
    const def = BUILDING_DEFS[b.kind];
    const text = buildingMessage(def, 'destruído pelos titãs', 'destruída pelos titãs');
    // Segmentos de muralha não enchem o diário um por um: o aviso de ataque já chama a atenção.
    if (!def.wall) addLog(sim.state, text);
    removeBuilding(sim, b);
    const ts = sim.tileSize;
    const c = { x: (b.tx + def.size / 2) * ts, y: (b.ty + def.size / 2) * ts };
    sim.fx.push({ type: 'dust', x: c.x, y: c.y, size: def.size * ts });
    sim.alerts.push({ kind: 'destroyed', text, x: c.x, y: c.y });
  }
}

// Tira do mapa um edifício (destruído ou demolido): libera o espaço, solta quem estava abrigado
// e cancela as ordens que apontavam para ele.
export function removeBuilding(sim: Sim, b: Building): void {
  const i = sim.state.buildings.indexOf(b);
  if (i < 0) return;
  ejectGarrison(sim, b);
  sim.releaseBuilding(b);
  sim.state.buildings.splice(i, 1);
  for (const u of sim.state.units) {
    const o = u.order;
    if ((o.type === 'build' || o.type === 'deliver' || o.type === 'garrison') && o.buildingId === b.id) {
      u.order = { type: 'idle' };
      clearPath(u);
    }
  }
}

export function garrisonCount(sim: Sim, b: Building): number {
  let n = 0;
  for (const u of sim.state.units) if (u.garrison === b.id) n++;
  return n;
}

// Solta as unidades abrigadas, em volta do edifício.
export function ejectGarrison(sim: Sim, b: Building, filter: (u: Unit) => boolean = () => true): Unit[] {
  const ts = sim.tileSize;
  const size = BUILDING_DEFS[b.kind].size;
  const spots: { x: number; y: number }[] = [];
  for (let r = 1; r <= 4 && spots.length < 40; r++) {
    for (let y = b.ty - r; y < b.ty + size + r; y++) {
      for (let x = b.tx - r; x < b.tx + size + r; x++) {
        const ring = x === b.tx - r || y === b.ty - r || x === b.tx + size + r - 1 || y === b.ty + size + r - 1;
        if (ring && sim.nav.isFree(x, y)) spots.push({ x: (x + 0.5) * ts, y: (y + 0.5) * ts });
      }
    }
  }
  const out: Unit[] = [];
  for (const u of sim.state.units) {
    if (u.garrison !== b.id || !filter(u)) continue;
    const spot = spots[out.length % Math.max(1, spots.length)] ?? { x: u.x, y: u.y + size * ts };
    u.garrison = 0;
    u.x = spot.x + (out.length >= spots.length ? 4 : 0);
    u.y = spot.y;
    u.order = { type: 'idle' };
    clearPath(u);
    out.push(u);
  }
  return out;
}

export function killTitan(sim: Sim, t: Titan): void {
  const i = sim.state.titans.indexOf(t);
  if (i < 0) return;
  sim.state.titans.splice(i, 1);
  sim.state.stats.titansKilled++;
  addMoraleMod(sim, 'Titã abatido', BALANCE.morale.titanKillBonus, 24);
  sim.fx.push({ type: 'steam', x: t.x, y: t.y, size: titanRadius(t.height) });
  addLog(sim.state, `Um titã de ${t.height.toFixed(1).replace('.', ',')} m foi abatido.`);
}

export function titanRadius(height: number): number {
  return 6 + 3.2 * height;
}

// Modificador temporário de moral (some depois de algumas horas de jogo).
export function addMoraleMod(sim: Sim, reason: string, value: number, hours: number): void {
  const ticksPerHour = (BALANCE.time.ticksPerSecond * BALANCE.time.secondsPerDay) / 24;
  sim.state.moraleMods.push({ reason, value, expiresTick: sim.state.tick + Math.round(hours * ticksPerHour) });
}

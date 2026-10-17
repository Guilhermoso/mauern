import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS, type Cost } from '../data/defs';
import type { Sim } from '../core/sim';
import { addLog } from '../state';
import type { Battalion, Building, Unit } from '../entities/types';
import { clearPath } from './movement';
import { ejectGarrison } from './damage';
import { unitMaxHp } from './modifiers';
import { canAfford, pay } from './commands';

const H = BALANCE.hospital;
const DT = 1 / BALANCE.time.ticksPerSecond;

// Hospital de Milícia: soldados feridos ficam internados (escondidos e protegidos) e aldeões
// médicos curam um paciente cada por vez. Curado por completo, o soldado sai sozinho — mas os de um
// batalhão esperam o batalhão inteiro sarar para saírem juntos.

export function hospitalBeds(b: Building): number {
  return Math.min(H.maxLevel, b.level) * H.bedsPerLevel;
}

// Vagas de médico: 3 no nível 1, mais 1 por nível de ampliação.
export function maxDoctors(b: Building): number {
  return H.maxDoctors + Math.min(H.maxLevel, b.level) - 1;
}

export function patients(sim: Sim, b: Building): Unit[] {
  return sim.state.units.filter((u) => u.garrison === b.id && UNIT_DEFS[u.kind].military);
}

export function doctors(sim: Sim, b: Building): Unit[] {
  return b.doctorIds.map((id) => sim.unit(id)).filter((u): u is Unit => !!u && u.garrison === b.id);
}

// Soldados a caminho (avulsos com ordem de internar ou batalhões marchando para cá) já reservam leito.
function reserved(sim: Sim, h: Building, exceptBattalion = 0): number {
  let n = 0;
  for (const u of sim.state.units) {
    if (u.garrison || !UNIT_DEFS[u.kind].military) continue;
    if (u.order.type === 'garrison' && u.order.buildingId === h.id && !u.battalion) n++;
  }
  for (const b of sim.state.battalions) {
    if (b.id === exceptBattalion || b.order.type !== 'hospital' || b.order.buildingId !== h.id) continue;
    n += 1 + b.memberIds.length;
  }
  return n;
}

export function freeBeds(sim: Sim, h: Building, exceptBattalion = 0): number {
  return hospitalBeds(h) - patients(sim, h).length - reserved(sim, h, exceptBattalion);
}

// Pode esta unidade entrar? Soldados precisam de leito; aldeões, de estar designados como médicos.
export function canEnterHospital(sim: Sim, h: Building, u: Unit): boolean {
  if (UNIT_DEFS[u.kind].military) return patients(sim, h).length < hospitalBeds(h);
  return h.doctorIds.includes(u.id) && doctors(sim, h).length < maxDoctors(h);
}

export function nearestHospitalWithBeds(sim: Sim, x: number, y: number, beds: number, exceptBattalion = 0): Building | undefined {
  let best: Building | undefined;
  let bestD = Infinity;
  for (const b of sim.state.buildings) {
    if (!b.built || !BUILDING_DEFS[b.kind].hospital || freeBeds(sim, b, exceptBattalion) < beds) continue;
    const s = BUILDING_DEFS[b.kind].size;
    const d = Math.hypot((b.tx + s / 2) * sim.tileSize - x, (b.ty + s / 2) * sim.tileSize - y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

// Clique direito no hospital: aldeões viram médicos (até 3), soldados avulsos vão se internar.
export function commandHospital(sim: Sim, ids: readonly number[], hospitalId: number): string | null {
  const h = sim.building(hospitalId);
  if (!h || !h.built) return 'Hospital indisponível.';
  h.doctorIds = h.doctorIds.filter((id) => sim.unit(id));
  let refusedDoctors = 0;
  let refusedBeds = 0;
  for (const id of ids) {
    const u = sim.unit(id);
    if (!u || u.battalion) continue;
    if (UNIT_DEFS[u.kind].military) {
      if (freeBeds(sim, h) <= 0) {
        refusedBeds++;
        continue;
      }
    } else if (u.kind === 'villager') {
      if (!h.doctorIds.includes(u.id)) {
        if (h.doctorIds.length >= maxDoctors(h)) {
          refusedDoctors++;
          continue;
        }
        h.doctorIds.push(u.id);
      }
    } else continue;
    u.order = { type: 'garrison', buildingId: h.id };
    clearPath(u);
  }
  if (refusedDoctors) return `O hospital já tem ${maxDoctors(h)} médicos (amplie para ter mais vagas).`;
  if (refusedBeds) return 'Não há leitos livres para todos.';
  return null;
}

export function dismissDoctors(sim: Sim, hospitalId: number): void {
  const h = sim.building(hospitalId);
  if (!h) return;
  const ids = new Set(h.doctorIds);
  h.doctorIds = [];
  ejectGarrison(sim, h, (u) => ids.has(u.id));
  for (const u of sim.state.units) {
    if (ids.has(u.id) && u.order.type === 'garrison' && u.order.buildingId === h.id) {
      u.order = { type: 'idle' };
      clearPath(u);
    }
  }
}

export function upgradeCost(b: Building): Cost {
  const next = b.level + 1;
  const out: Cost = {};
  for (const [k, v] of Object.entries(H.upgradeCost)) out[k as keyof Cost] = v * next;
  return out;
}

export function upgradeTime(b: Building): number {
  return H.upgradeSeconds * (b.level + 1);
}

export function startHospitalUpgrade(sim: Sim, hospitalId: number): string | null {
  const h = sim.building(hospitalId);
  if (!h || !h.built || !BUILDING_DEFS[h.kind].hospital) return 'Hospital indisponível.';
  if (h.level >= H.maxLevel) return 'O hospital já está no nível máximo.';
  if (h.upgradeProgress >= 0) return 'O hospital já está sendo ampliado.';
  const cost = upgradeCost(h);
  if (!canAfford(sim, cost)) return 'Recursos insuficientes.';
  pay(sim, cost);
  h.upgradeProgress = 0;
  return null;
}

function battalionOfUnit(sim: Sim, u: Unit): Battalion | undefined {
  return u.battalion ? sim.state.battalions.find((b) => b.id === u.battalion) : undefined;
}

// Nobres e os soldados do batalhão de um nobre são curados primeiro.
export function hasNoblePriority(sim: Sim, u: Unit): boolean {
  if (u.noble) return true;
  const b = battalionOfUnit(sim, u);
  return !!b && [b.commanderId, ...b.memberIds].some((id) => sim.unit(id)?.noble);
}

export function updateHospitals(sim: Sim): void {
  const s = sim.state;
  for (const h of s.buildings) {
    if (!h.built || !BUILDING_DEFS[h.kind].hospital) continue;
    h.doctorIds = h.doctorIds.filter((id) => sim.unit(id));

    if (h.upgradeProgress >= 0) {
      h.upgradeProgress += DT;
      if (h.upgradeProgress >= upgradeTime(h)) {
        h.level++;
        h.upgradeProgress = -1;
        addLog(s, `Hospital ampliado para o nível ${h.level}: ${hospitalBeds(h)} leitos.`);
      }
    }

    // Cada médico cuida de um paciente por vez, na ordem de chegada — mas nobres e o batalhão
    // de um nobre têm prioridade.
    const docs = doctors(sim, h);
    const list = patients(sim, h);
    const needing = list.filter((u) => u.hp < unitMaxHp(s, u));
    needing.sort((a, b) => (hasNoblePriority(sim, a) ? 0 : 1) - (hasNoblePriority(sim, b) ? 0 : 1));
    for (let i = 0; i < Math.min(docs.length, needing.length); i++) {
      const p = needing[i];
      p.hp = Math.min(unitMaxHp(s, p), p.hp + H.healPerSecond * DT);
    }

    // Curados saem sozinhos (batalhões, só quando todos estiverem curados).
    for (const p of list) {
      if (p.garrison !== h.id || p.hp < unitMaxHp(s, p)) continue;
      const b = battalionOfUnit(sim, p);
      if (!b) {
        ejectGarrison(sim, h, (u) => u.id === p.id);
        continue;
      }
      const members = [b.commanderId, ...b.memberIds].map((id) => sim.unit(id)).filter((u): u is Unit => !!u);
      const allHealed = members.every((u) => u.garrison === h.id && u.hp >= unitMaxHp(s, u));
      if (allHealed) {
        ejectGarrison(sim, h, (u) => u.battalion === b.id);
        b.inHospital = 0;
        b.order = { type: 'idle' };
        addLog(s, `${b.name} recebeu alta do hospital.`);
      }
    }
  }
}

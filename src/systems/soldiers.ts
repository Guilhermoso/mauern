import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import { MAX_LEVEL, rankName, rankTitle, xpToNext } from '../data/ranks';
import type { Sim } from '../core/sim';
import { addLog } from '../state';
import type { Building, Unit, UnitOrder } from '../entities/types';
import { unitMaxHp } from './modifiers';
import { moveTo } from './movement';
import { isFemaleName } from '../entities/names';

const S = BALANCE.soldiers;
const DT = 1 / BALANCE.time.ticksPerSecond;

type TrainOrder = Extract<UnitOrder, { type: 'train' }>;

export function isSoldier(u: Unit): boolean {
  return UNIT_DEFS[u.kind].military;
}

// Dá experiência a um soldado; sobe de nível quantas vezes for preciso.
export function gainXp(sim: Sim, u: Unit, amount: number): void {
  if (!isSoldier(u) || u.level >= MAX_LEVEL || amount <= 0) return;
  u.xp += amount;
  while (u.level < MAX_LEVEL && u.xp >= xpToNext(u.level)) {
    u.xp -= xpToNext(u.level);
    const before = unitMaxHp(sim.state, u);
    const oldTitle = rankTitle(u.level);
    u.level++;
    // A vida máxima cresce com o nível; a vida atual acompanha.
    u.hp += unitMaxHp(sim.state, u) - before;
    if (rankTitle(u.level) !== oldTitle) {
      const text = `${u.name} foi ${isFemaleName(u.name) ? 'promovida' : 'promovido'} a ${rankName(u.level)} (nível ${u.level}).`;
      addLog(sim.state, text);
      sim.alerts.push({ kind: 'promotion', text, x: u.x, y: u.y });
    }
  }
  if (u.level >= MAX_LEVEL) u.xp = 0;
}

// --- Campo de treinamento ---

export function trainees(sim: Sim, field: Building): Unit[] {
  return sim.state.units.filter((u) => u.order.type === 'train' && u.order.buildingId === field.id);
}

export function trainer(sim: Sim, field: Building): Unit | undefined {
  if (!field.trainerId) return undefined;
  const t = sim.unit(field.trainerId);
  return t && t.order.type === 'train' && t.order.buildingId === field.id ? t : undefined;
}

function insideField(sim: Sim, u: Unit, field: Building): boolean {
  const ts = sim.tileSize;
  const s = BUILDING_DEFS[field.kind].size;
  return u.x >= field.tx * ts && u.y >= field.ty * ts && u.x < (field.tx + s) * ts && u.y < (field.ty + s) * ts;
}

// Velocidade de treino de um aluno (experiência por segundo) com o treinador atual.
export function trainingRate(trainerUnit: Unit | undefined, student: Unit): number {
  if (!trainerUnit) return 0;
  let rate = S.trainingXpPerSecond * (1 + trainerUnit.level * S.trainerBonusPerLevel);
  if (student.level >= trainerUnit.level) rate *= S.aboveTrainerFactor;
  return rate;
}

// Cada soldado com ordem de treinar anda até um ponto dentro do campo e fica lá.
export function updateTraining(sim: Sim, u: Unit, o: TrainOrder): boolean {
  const field = sim.building(o.buildingId);
  if (!field || !field.built) return false;
  const s = BUILDING_DEFS[field.kind].size;
  // Ponto de cada um no campo: o treinador na frente, os alunos em fileiras.
  const isTrainer = field.trainerId === u.id;
  const students = trainees(sim, field).filter((x) => x.id !== field.trainerId);
  const idx = Math.max(0, students.indexOf(u));
  let tx = isTrainer ? field.tx + Math.floor(s / 2) : field.tx + (idx % s);
  let ty = isTrainer ? field.ty : field.ty + 1 + (Math.floor(idx / s) % (s - 1));
  if (!sim.nav.isFree(tx, ty)) {
    // Posto bloqueado: usa o tile livre do campo mais próximo dele.
    let best: { x: number; y: number } | null = null;
    for (let y = field.ty; y < field.ty + s; y++) {
      for (let x = field.tx; x < field.tx + s; x++) {
        if (sim.nav.isFree(x, y) && (!best || Math.hypot(x - tx, y - ty) < Math.hypot(best.x - tx, best.y - ty))) best = { x, y };
      }
    }
    if (!best) return false;
    tx = best.x;
    ty = best.y;
  }
  const atSlot = Math.floor(u.x / sim.tileSize) === tx && Math.floor(u.y / sim.tileSize) === ty;
  if (!insideField(sim, u, field) || u.path.length || !atSlot) {
    const r = moveTo(sim, u, { x0: tx, y0: ty, x1: tx, y1: ty, adjacent: false });
    if (r === 'unreachable') return insideField(sim, u, field);
    if (r === 'moving') return true;
  }
  u.moving = false;
  const t = trainer(sim, field);
  if (!t || isTrainer) return true;
  const gain = trainingRate(t, u) * DT;
  gainXp(sim, u, gain);
  gainXp(sim, t, gain * S.trainerShare);
  // O treinador olha para a turma.
  t.facing = Math.PI / 2;
  u.facing = -Math.PI / 2;
  return true;
}

// Coloca soldados para treinar num campo. Retorna erro ou null.
export function commandTrain(sim: Sim, ids: readonly number[], fieldId: number): string | null {
  const field = sim.building(fieldId);
  if (!field || !field.built || field.kind !== 'trainingGround') return 'Campo de treinamento indisponível.';
  let free = S.trainingCapacity + 1 - trainees(sim, field).length;
  let skipped = 0;
  for (const id of ids) {
    const u = sim.unit(id);
    if (!u || !isSoldier(u)) continue;
    if (u.battalion) {
      skipped++;
      continue;
    }
    if (free <= 0) break;
    u.order = { type: 'train', buildingId: field.id };
    u.path = [];
    u.pathKey = '';
    free--;
  }
  if (skipped) return 'Soldados em batalhão não treinam: desfaça o batalhão primeiro.';
  return null;
}

export function setTrainer(sim: Sim, fieldId: number, unitId: number): string | null {
  const field = sim.building(fieldId);
  const u = sim.unit(unitId);
  if (!field || !u) return 'Indisponível.';
  if (u.order.type !== 'train' || u.order.buildingId !== field.id) return 'O treinador precisa estar no campo.';
  field.trainerId = u.id;
  u.path = [];
  u.pathKey = '';
  return null;
}

export function dismissTraining(sim: Sim, fieldId: number): void {
  const field = sim.building(fieldId);
  if (!field) return;
  for (const u of trainees(sim, field)) {
    u.order = { type: 'idle' };
    u.path = [];
    u.pathKey = '';
  }
  field.trainerId = 0;
}

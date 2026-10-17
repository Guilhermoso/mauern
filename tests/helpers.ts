import { BALANCE } from '../src/data/balance';
import { Sim } from '../src/core/sim';
import { step } from '../src/core/simulation';
import { createNewGame, newUnit, type GameState } from '../src/state';
import { Tile } from '../src/world/terrain';
import type { ResourceNode } from '../src/entities/types';

// Mundo de teste pequeno e controlado: só grama, sem recursos, com o Centro da Vila no centro.
export function flatGame(): GameState {
  const s = createNewGame('teste');
  s.world.tiles.fill(Tile.Grass);
  s.world.resourceNodes = [];
  s.units = [];
  return s;
}

export function addNode(s: GameState, kind: ResourceNode['kind'], tx: number, ty: number, amount = 100): ResourceNode {
  const n: ResourceNode = { id: s.nextId++, kind, tx, ty, amount, variant: 0.5 };
  s.world.resourceNodes.push(n);
  return n;
}

export function addVillager(s: GameState, tx: number, ty: number) {
  const ts = BALANCE.world.tileSize;
  const u = newUnit(s.nextId++, 'villager', 'Teste', (tx + 0.5) * ts, (ty + 0.5) * ts);
  s.units.push(u);
  return u;
}

export function runSeconds(sim: Sim, seconds: number): void {
  const n = Math.round(seconds * BALANCE.time.ticksPerSecond);
  for (let i = 0; i < n; i++) step(sim);
}

export const CENTER = BALANCE.world.width / 2;

import { titanStats } from '../src/systems/titans';
import type { Titan } from '../src/entities/types';

export function addTitan(s: GameState, tx: number, ty: number, height = 4): Titan {
  const ts = BALANCE.world.tileSize;
  const st = titanStats(height);
  const t: Titan = {
    id: s.nextId++, kind: 'common', height, x: (tx + 0.5) * ts, y: (ty + 0.5) * ts, hp: st.maxHp, maxHp: st.maxHp,
    facing: 0, targetKind: 'none', targetId: 0, path: [], pathKey: '', repathTick: 0, retargetTick: 0,
    attackCooldown: 0, lastHitTick: -1000, sighted: true, skin: 0.5,
  };
  s.titans.push(t);
  return t;
}

// Coloca o relógio ao meio-dia de um dia (para os testes não dependerem da noite).
export function setNoon(s: GameState, day = 1): void {
  const perDay = BALANCE.time.ticksPerSecond * BALANCE.time.secondsPerDay;
  s.tick = Math.round((day - 1) * perDay + ((12 - BALANCE.time.startHour) / 24) * perDay);
  // Sem titãs avulsos durante os testes, a menos que o teste peça.
  s.threat.nextSpawnTick = Number.MAX_SAFE_INTEGER;
  s.threat.nextGreatAttackDay = 9999;
}

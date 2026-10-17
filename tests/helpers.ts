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

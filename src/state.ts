import { BALANCE } from './data/balance';
import { Rng, hashString } from './core/rng';
import { generateWorld } from './world/generate';
import type { World } from './world/world';
import type { Building, Resources, Unit } from './entities/types';
import { BUILDING_DEFS, UNIT_DEFS } from './entities/defs';
import { randomName } from './entities/names';

export const SAVE_VERSION = 1;

export interface LogEntry {
  tick: number;
  text: string;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface GameState {
  version: number;
  seed: string;
  rngState: number;
  createdAt: number;
  tick: number;
  speed: number;
  resources: Resources;
  world: World;
  buildings: Building[];
  units: Unit[];
  nextId: number;
  camera: CameraState;
  log: LogEntry[];
}

export function createNewGame(seed: string): GameState {
  const world = generateWorld(seed);
  const rng = new Rng(hashString(seed) ^ 0x51ed270b);
  const ts = BALANCE.world.tileSize;
  const tcSize = BUILDING_DEFS.townCenter.size;
  const tcX = world.width / 2 - tcSize / 2;
  const tcY = world.height / 2 - tcSize / 2;

  // IDs de entidades começam depois dos IDs dos recursos do mapa.
  let nextId = world.resourceNodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;

  const buildings: Building[] = [
    { id: nextId++, kind: 'townCenter', tx: tcX, ty: tcY, hp: BUILDING_DEFS.townCenter.maxHp },
  ];

  const units: Unit[] = [];
  const centerX = (world.width / 2) * ts;
  const centerY = (world.height / 2) * ts;
  for (let i = 0; i < BALANCE.start.villagers; i++) {
    const a = (i / BALANCE.start.villagers) * Math.PI + Math.PI * 0.25;
    units.push({
      id: nextId++,
      kind: 'villager',
      name: randomName(rng),
      x: centerX + Math.cos(a) * ts * 3.2,
      y: centerY + Math.sin(a) * ts * 3.2,
      hp: UNIT_DEFS.villager.maxHp,
      facing: a,
    });
  }
  for (let i = 0; i < BALANCE.start.scouts; i++) {
    units.push({
      id: nextId++,
      kind: 'scout',
      name: randomName(rng),
      x: centerX - ts * 3.5,
      y: centerY - ts * 2.5,
      hp: UNIT_DEFS.scout.maxHp,
      facing: Math.PI,
    });
  }

  return {
    version: SAVE_VERSION,
    seed,
    rngState: rng.state,
    createdAt: Date.now(),
    tick: 0,
    speed: 1,
    resources: { ...BALANCE.start.resources },
    world,
    buildings,
    units,
    nextId,
    camera: { x: centerX, y: centerY, zoom: 1 },
    log: [{ tick: 0, text: 'Um pequeno grupo de sobreviventes funda um refúgio. Que estas terras nos protejam.' }],
  };
}

export function populationCap(state: GameState): number {
  return state.buildings.reduce((sum, b) => sum + BUILDING_DEFS[b.kind].housing, 0);
}

export function addLog(state: GameState, text: string): void {
  state.log.push({ tick: state.tick, text });
  if (state.log.length > BALANCE.log.maxEntries) state.log.splice(0, state.log.length - BALANCE.log.maxEntries);
}

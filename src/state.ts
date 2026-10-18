import { BALANCE } from './data/balance';
import { Rng, hashString } from './core/rng';
import { generateWorld } from './world/generate';
import type { World } from './world/world';
import type {
  Battalion,
  Building,
  BuildingKind,
  CityState,
  EventState,
  MemorialEntry,
  MoraleModifier,
  Poi,
  ResourceKind,
  Resources,
  Stats,
  ThreatState,
  Titan,
  Unit,
  UnitKind,
} from './entities/types';
import { BUILDING_DEFS, UNIT_DEFS } from './data/defs';
import { randomName } from './entities/names';
import { generatePois } from './world/pois';

export const SAVE_VERSION = 11;

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
  titans: Titan[];
  threat: ThreatState;
  alarm: boolean; // sino de alarme tocando: aldeões abrigados
  era: number; // 0 = Era I (Refúgio)
  techs: string[]; // tecnologias pesquisadas
  relics: string[]; // crônicas cumpridas (cada uma dá uma relíquia)
  morale: number; // 0 a 100
  moraleMods: MoraleModifier[];
  stats: Stats;
  city: CityState;
  events: EventState;
  battalions: Battalion[];
  battalionCount: number; // para numerar os batalhões (1º, 2º, ...)
  memorial: MemorialEntry[];
  pois: Poi[];
  explored: Uint8Array; // névoa de guerra: 1 = tile já visto alguma vez
  market: Partial<Record<ResourceKind, number>>; // mercado: fator de preço de cada recurso (1 = preço base)
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

  // Pontos de interesse (as jazidas valiosas acrescentam recursos ao mapa).
  let nodeId = world.resourceNodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  const pois = generatePois(world, seed, () => nodeId++);

  // IDs de entidades começam depois dos IDs dos recursos do mapa.
  let nextId = nodeId;

  const buildings: Building[] = [newBuilding(nextId++, 'townCenter', tcX, tcY, true)];

  const units: Unit[] = [];
  const centerX = (world.width / 2) * ts;
  const centerY = (world.height / 2) * ts;
  for (let i = 0; i < BALANCE.start.villagers; i++) {
    const a = (i / BALANCE.start.villagers) * Math.PI + Math.PI * 0.25;
    units.push(newUnit(nextId++, 'villager', randomName(rng), centerX + Math.cos(a) * ts * 3.2, centerY + Math.sin(a) * ts * 3.2));
  }
  for (let i = 0; i < BALANCE.start.scouts; i++) {
    units.push(newUnit(nextId++, 'scout', randomName(rng), centerX - ts * 3.5, centerY - ts * 2.5));
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
    titans: [],
    threat: newThreat(),
    alarm: false,
    era: 0,
    techs: [],
    relics: [],
    morale: BALANCE.morale.start,
    moraleMods: [],
    stats: newStats(),
    city: { starving: false, cold: false, hungerThisWinter: false, taxCarry: 0, lackBread: false, lackClothes: false },
    market: newMarket(),
    events: { nextDay: BALANCE.events.firstDay, active: null },
    battalions: [],
    battalionCount: 0,
    memorial: [],
    pois,
    explored: initialExplored(world.width, world.height, [{ x: world.width / 2, y: world.height / 2, r: BALANCE.fog.startRadius }]),
    nextId,
    camera: { x: centerX, y: centerY, zoom: 1 },
    log: [{ tick: 0, text: 'Um pequeno grupo de sobreviventes funda um refúgio. Que estas terras nos protejam.' }],
  };
}

// Névoa inicial: só os discos informados (em tiles) já foram vistos.
export function initialExplored(width: number, height: number, discs: { x: number; y: number; r: number }[]): Uint8Array {
  const out = new Uint8Array(width * height);
  for (const d of discs) {
    for (let y = Math.max(0, Math.floor(d.y - d.r)); y <= Math.min(height - 1, Math.ceil(d.y + d.r)); y++) {
      for (let x = Math.max(0, Math.floor(d.x - d.r)); x <= Math.min(width - 1, Math.ceil(d.x + d.r)); x++) {
        if ((x - d.x) ** 2 + (y - d.y) ** 2 <= d.r * d.r) out[y * width + x] = 1;
      }
    }
  }
  return out;
}

export function newBuilding(id: number, kind: BuildingKind, tx: number, ty: number, built: boolean): Building {
  const def = BUILDING_DEFS[kind];
  return {
    id, kind, tx, ty,
    hp: built ? def.maxHp : 1,
    built,
    progress: built ? def.buildTime : 0,
    queue: [],
    rally: null,
    farmerId: 0,
    attackCooldown: 0,
    level: 1,
    needHours: 0,
    missingHours: 0,
    research: null,
    trainerId: 0,
    guardId: 0,
    doctorIds: [],
    upgradeProgress: -1,
    ruined: false,
    produce: 0,
  };
}

export function newMarket(): Partial<Record<ResourceKind, number>> {
  const out: Partial<Record<ResourceKind, number>> = {};
  for (const k of Object.keys(BALANCE.market.basePrice) as ResourceKind[]) out[k] = 1;
  return out;
}

export function newStats(): Stats {
  return {
    titansKilled: 0,
    deaths: 0,
    greatAttacksRepelled: 0,
    flawlessHordes: 0,
    hordeDeathsAtStart: -1,
    gathered: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0, wool: 0, bread: 0, clothes: 0 },
    moraleHighHours: 0,
    wintersSurvived: 0,
    wintersWithoutHunger: 0,
  };
}

export function newThreat(): ThreatState {
  const ticksPerHour = (BALANCE.time.ticksPerSecond * BALANCE.time.secondsPerDay) / 24;
  // Primeiro titã: manhã do dia em que a ameaça começa.
  const firstTick = Math.round(((BALANCE.titans.firstSpawnDay - 1) * 24 + 10 - BALANCE.time.startHour) * ticksPerHour);
  return {
    nextSpawnTick: firstTick,
    nextGreatAttackDay: BALANCE.titans.greatAttackEveryDays,
    greatAttackAnnounced: false,
    greatAttackDir: 0,
  };
}

export function newUnit(id: number, kind: UnitKind, name: string, x: number, y: number): Unit {
  return {
    id, kind, name, x, y,
    hp: UNIT_DEFS[kind].maxHp,
    facing: Math.PI / 2,
    order: { type: 'idle' },
    path: [],
    pathKey: '',
    pathComplete: true,
    carry: null,
    work: 0,
    moving: false,
    garrison: 0,
    attackCooldown: 0,
    prevOrder: null,
    level: 1,
    xp: 0,
    battalion: 0,
    speedCap: 0,
    terror: 0,
    noble: false,
    kills: 0,
    shield: 0,
    lastCombatTick: 0,
    speedBonus: 0,
  };
}

export function housingOf(b: Building): number {
  if (!b.built) return 0;
  if (b.kind === 'house') return BALANCE.city.houseHousing[b.level - 1] ?? 0;
  return BUILDING_DEFS[b.kind].housing;
}

export function populationCap(state: GameState): number {
  const cap = state.buildings.reduce((sum, b) => sum + housingOf(b), 0);
  return Math.min(cap, BALANCE.population.max);
}

export function addLog(state: GameState, text: string): void {
  state.log.push({ tick: state.tick, text });
  if (state.log.length > BALANCE.log.maxEntries) state.log.splice(0, state.log.length - BALANCE.log.maxEntries);
}

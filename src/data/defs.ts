import type { BuildingKind, ResourceKind, ResourceNodeKind, Resources, UnitKind } from '../entities/types';

// Definições de edifícios, unidades e recursos. Os números ficam aqui (e em balance.ts),
// nunca espalhados pelo código.

export type Cost = Partial<Resources>;

export interface BuildingDef {
  name: string;
  feminine: boolean; // para concordância nas mensagens ("Casa concluída", "Moinho concluído")
  description: string;
  size: number; // lado em tiles
  maxHp: number;
  housing: number;
  cost: Cost;
  buildTime: number; // segundos para 1 aldeão
  dropsite: ResourceKind[]; // recursos que podem ser entregues aqui
  walkable: boolean; // fazendas podem ser atravessadas
  trains: UnitKind[];
  hotkey?: string; // tecla (KeyboardEvent.code) no menu de construção do aldeão
  autoGather?: ResourceNodeKind; // ao terminar, os construtores vão coletar este recurso por perto
}

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  townCenter: {
    name: 'Centro da Vila',
    feminine: false,
    description: 'O coração da cidade. Treina aldeões e recebe todos os recursos.',
    size: 4, maxHp: 2400, housing: 5, cost: { wood: 275, stone: 100 }, buildTime: 150,
    dropsite: ['food', 'wood', 'stone', 'iron', 'gold'], walkable: false, trains: ['villager'],
  },
  house: {
    name: 'Casa',
    feminine: true,
    description: 'Abriga 5 habitantes.',
    size: 2, maxHp: 550, housing: 5, cost: { wood: 30 }, buildTime: 15,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyQ',
  },
  lumberCamp: {
    name: 'Depósito de Madeira',
    feminine: false,
    description: 'Ponto de entrega de madeira. Construa perto das árvores.',
    size: 2, maxHp: 600, housing: 0, cost: { wood: 100 }, buildTime: 25,
    dropsite: ['wood'], walkable: false, trains: [], hotkey: 'KeyE', autoGather: 'tree',
  },
  miningCamp: {
    name: 'Depósito de Mineração',
    feminine: false,
    description: 'Ponto de entrega de pedra e ferro. Construa perto das jazidas.',
    size: 2, maxHp: 600, housing: 0, cost: { wood: 100 }, buildTime: 25,
    dropsite: ['stone', 'iron', 'gold'], walkable: false, trains: [], hotkey: 'KeyR', autoGather: 'stone',
  },
  mill: {
    name: 'Moinho',
    feminine: false,
    description: 'Ponto de entrega de comida. Construa perto de frutas e fazendas.',
    size: 2, maxHp: 600, housing: 0, cost: { wood: 100 }, buildTime: 30,
    dropsite: ['food'], walkable: false, trains: [], hotkey: 'KeyF', autoGather: 'berries',
  },
  farm: {
    name: 'Fazenda',
    feminine: true,
    description: 'Produz comida sem se esgotar. Um aldeão por fazenda.',
    size: 3, maxHp: 400, housing: 0, cost: { wood: 60 }, buildTime: 15,
    dropsite: [], walkable: true, trains: [], hotkey: 'KeyG',
  },
};

// Ordem dos botões no menu de construção do aldeão.
export const VILLAGER_BUILDS: BuildingKind[] = ['house', 'lumberCamp', 'miningCamp', 'mill', 'farm'];

export interface UnitDef {
  name: string;
  maxHp: number;
  radius: number;
  speed: number; // pixels de mundo por segundo
  cost: Cost;
  trainTime: number; // segundos
  canGather: boolean;
  canBuild: boolean;
  carryCapacity: number;
}

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  villager: {
    name: 'Aldeão', maxHp: 25, radius: 6, speed: 52, cost: { food: 50 }, trainTime: 20,
    canGather: true, canBuild: true, carryCapacity: 10,
  },
  scout: {
    name: 'Batedor', maxHp: 45, radius: 9, speed: 120, cost: { food: 80 }, trainTime: 30,
    canGather: false, canBuild: false, carryCapacity: 0,
  },
};

export interface NodeDef {
  name: string;
  resource: ResourceKind;
  gatherRate: number; // unidades por segundo por aldeão
  gatherable: boolean; // cristais só poderão ser coletados na Era III
}

export const NODE_DEFS: Record<ResourceNodeKind, NodeDef> = {
  tree: { name: 'Árvore', resource: 'wood', gatherRate: 0.45, gatherable: true },
  berries: { name: 'Arbusto de frutas', resource: 'food', gatherRate: 0.55, gatherable: true },
  stone: { name: 'Jazida de pedra', resource: 'stone', gatherRate: 0.35, gatherable: true },
  iron: { name: 'Jazida de ferro', resource: 'iron', gatherRate: 0.3, gatherable: true },
  crystal: { name: 'Cristais', resource: 'gold', gatherRate: 0.2, gatherable: false },
};

export function buildingMessage(def: BuildingDef, masculine: string, feminine: string): string {
  return `${def.name} ${def.feminine ? feminine : masculine}.`;
}

export const FARM_GATHER_RATE = 0.4;

export const RESOURCE_NAMES: Record<ResourceKind, string> = {
  food: 'Comida',
  wood: 'Madeira',
  stone: 'Pedra',
  iron: 'Ferro',
  gold: 'Ouro',
};

export function formatCost(cost: Cost): string {
  return (Object.entries(cost) as [ResourceKind, number][]).map(([k, v]) => `${v} ${RESOURCE_NAMES[k].toLowerCase()}`).join(', ');
}

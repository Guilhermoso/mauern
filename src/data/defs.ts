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
  wall?: boolean; // segmento de muralha: construído arrastando uma linha
  gate?: boolean; // portão: passagem para os humanos, barreira para os titãs
  garrison: number; // quantas unidades podem se abrigar dentro
  hospital?: boolean; // recebe soldados feridos (leitos pelo nível) e médicos
  attack?: BuildingAttack; // edifícios que atiram flechas nos titãs
  era?: number; // era em que é liberado (0 = Era I)
  rubble?: boolean; // destruído, vira escombro consertável em vez de sumir
}

export interface BuildingAttack {
  damage: number;
  cooldown: number; // segundos entre flechas
  range: number; // em tiles
  needsGarrison: boolean; // só atira com alguém dentro
  damagePerGarrison: number; // dano extra por unidade abrigada
}

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  townCenter: {
    name: 'Centro da Vila',
    feminine: false,
    description: 'O coração da cidade. Treina aldeões e recebe todos os recursos.',
    size: 4, maxHp: 3000, housing: 5, cost: { wood: 275, stone: 100 }, buildTime: 150,
    dropsite: ['food', 'wood', 'stone', 'iron', 'gold'], walkable: false, trains: ['villager', 'militia'],
    garrison: 15, attack: { damage: 3, cooldown: 2, range: 6, needsGarrison: false, damagePerGarrison: 0.5 },
  },
  house: {
    name: 'Casa',
    feminine: true,
    description: 'Abriga moradores e paga impostos. Evolui com água, fogueira e moral.',
    size: 2, maxHp: 550, housing: 5, cost: { wood: 30 }, buildTime: 15,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyQ', garrison: 0,
  },
  lumberCamp: {
    name: 'Depósito de Madeira',
    feminine: false,
    description: 'Ponto de entrega de madeira. Construa perto das árvores.',
    size: 2, maxHp: 600, housing: 0, cost: { wood: 100 }, buildTime: 25,
    dropsite: ['wood'], walkable: false, trains: [], hotkey: 'KeyE', autoGather: 'tree', garrison: 0,
  },
  miningCamp: {
    name: 'Depósito de Mineração',
    feminine: false,
    description: 'Ponto de entrega de pedra e ferro. Construa perto das jazidas.',
    size: 2, maxHp: 600, housing: 0, cost: { wood: 100 }, buildTime: 25,
    dropsite: ['stone', 'iron', 'gold'], walkable: false, trains: [], hotkey: 'KeyR', autoGather: 'stone', garrison: 0,
  },
  mill: {
    name: 'Moinho',
    feminine: false,
    description: 'Ponto de entrega de comida. Construa perto de frutas e fazendas.',
    size: 2, maxHp: 600, housing: 0, cost: { wood: 100 }, buildTime: 30,
    dropsite: ['food'], walkable: false, trains: [], hotkey: 'KeyF', autoGather: 'berries', garrison: 0,
  },
  farm: {
    name: 'Fazenda',
    feminine: true,
    description: 'Produz comida sem se esgotar. Um aldeão por fazenda.',
    size: 3, maxHp: 400, housing: 0, cost: { wood: 60 }, buildTime: 15,
    dropsite: [], walkable: true, trains: [], hotkey: 'KeyG', garrison: 0,
  },
  palisade: {
    name: 'Paliçada',
    feminine: true,
    description: 'Muro de troncos. Arraste para construir uma linha. Os titãs precisam derrubá-la para passar.',
    size: 1, maxHp: 300, housing: 0, cost: { wood: 2 }, buildTime: 4,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyZ', wall: true, garrison: 0,
  },
  gate: {
    name: 'Portão de Paliçada',
    feminine: false,
    description: 'Passagem na paliçada: os seus podem atravessar, os titãs não. Pode ser posto sobre a paliçada.',
    size: 1, maxHp: 450, housing: 0, cost: { wood: 15 }, buildTime: 8,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyX', gate: true, garrison: 0,
  },
  watchTower: {
    name: 'Torre de Vigia',
    feminine: true,
    description: 'Atira flechas nos titãs. Abrigue unidades dentro para mais dano.',
    size: 2, maxHp: 700, housing: 0, cost: { wood: 100, stone: 25 }, buildTime: 35,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyT', garrison: 5,
    attack: { damage: 4, cooldown: 2, range: 7, needsGarrison: false, damagePerGarrison: 1 },
  },
  well: {
    name: 'Poço',
    feminine: false,
    description: 'Água para as casas por perto. Casas sem água não evoluem.',
    size: 1, maxHp: 250, housing: 0, cost: { wood: 30, stone: 20 }, buildTime: 15,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyV', garrison: 0,
  },
  hospital: {
    name: 'Hospital de Milícia',
    feminine: false,
    description: 'Soldados feridos ficam aqui até serem curados por completo. Designe aldeões como médicos: 3 vagas, e mais 1 a cada ampliação.',
    size: 3, maxHp: 900, housing: 0, cost: { wood: 150, stone: 50 }, buildTime: 40,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyI', garrison: 0, hospital: true,
  },
  refuge: {
    name: 'Campo de Refúgio',
    feminine: false,
    description: 'Abrigo para onde os aldeões fogem quando um titã chega perto. Um soldado no posto acalma o terror mais rápido.',
    size: 3, maxHp: 900, housing: 0, cost: { wood: 120, stone: 30 }, buildTime: 30,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyU', garrison: 25,
  },
  trainingGround: {
    name: 'Campo de Treinamento',
    feminine: false,
    description: 'Soldados treinam combate aqui. Escolha um deles como treinador: quanto maior o nível dele, mais rápido os outros aprendem.',
    size: 4, maxHp: 800, housing: 0, cost: { wood: 150, stone: 40 }, buildTime: 40,
    dropsite: [], walkable: true, trains: [], hotkey: 'KeyY', garrison: 0,
  },
  // --- Era II ---
  barracks: {
    name: 'Quartel',
    feminine: false,
    description: 'Treina lanceiros, a infantaria pesada da Era II, e pesquisa melhorias militares.',
    size: 3, maxHp: 1400, housing: 0, cost: { wood: 200, stone: 100 }, buildTime: 60,
    dropsite: [], walkable: false, trains: ['spearman'], hotkey: 'KeyK', garrison: 0, era: 1,
  },
  archeryRange: {
    name: 'Campo de Arqueiros',
    feminine: false,
    description: 'Treina arqueiros, que atacam os titãs de longe. Arqueiros dentro de torres dão muito mais dano.',
    size: 3, maxHp: 1100, housing: 0, cost: { wood: 220, stone: 60 }, buildTime: 55,
    dropsite: [], walkable: false, trains: ['archer'], hotkey: 'KeyJ', garrison: 0, era: 1,
  },
  stoneWall: {
    name: 'Muro de Pedra',
    feminine: false,
    description: 'Muito mais forte que a paliçada. Arraste para construir — pode ser posto por cima da paliçada. Destruído, vira escombro que os aldeões reconstroem.',
    size: 1, maxHp: 1600, housing: 0, cost: { stone: 6 }, buildTime: 10,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyM', wall: true, garrison: 0, era: 1, rubble: true,
  },
  stoneGate: {
    name: 'Portão de Pedra',
    feminine: false,
    description: 'Passagem no muro de pedra. Pode ser posto sobre muros e paliçadas. Destruído, vira escombro.',
    size: 1, maxHp: 2000, housing: 0, cost: { stone: 30 }, buildTime: 16,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyN', gate: true, garrison: 0, era: 1, rubble: true,
  },
  stoneTower: {
    name: 'Torre de Pedra',
    feminine: true,
    description: 'Torre alta que atira longe. Arqueiros abrigados dentro multiplicam o dano.',
    size: 2, maxHp: 2200, housing: 0, cost: { wood: 50, stone: 150 }, buildTime: 60,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyO', garrison: 8, era: 1,
    attack: { damage: 8, cooldown: 1.6, range: 9, needsGarrison: false, damagePerGarrison: 1.5 },
  },
  bonfire: {
    name: 'Fogueira Comunitária',
    feminine: true,
    description: 'Ponto de encontro dos moradores. Melhora a moral e permite casas de pedra por perto.',
    size: 2, maxHp: 300, housing: 0, cost: { wood: 60, stone: 10 }, buildTime: 20,
    dropsite: [], walkable: false, trains: [], hotkey: 'KeyC', garrison: 0,
  },
};

// Ordem dos botões no menu de construção do aldeão.
export const VILLAGER_BUILDS: BuildingKind[] = [
  'house', 'well', 'bonfire', 'lumberCamp', 'miningCamp', 'mill', 'farm', 'palisade', 'gate', 'watchTower', 'trainingGround', 'refuge', 'hospital',
  'barracks', 'archeryRange', 'stoneWall', 'stoneGate', 'stoneTower',
];

export interface UnitDef {
  name: string;
  nameFeminine: string;
  maxHp: number;
  radius: number;
  speed: number; // pixels de mundo por segundo
  cost: Cost;
  trainTime: number; // segundos
  canGather: boolean;
  canBuild: boolean;
  carryCapacity: number;
  attack: number; // dano por golpe
  attackCooldown: number; // segundos entre golpes
  autoAttack: boolean; // ataca sozinho titãs que chegam perto
  military: boolean;
  hotkey: string; // tecla para treinar no edifício
  range?: number; // ataque à distância: alcance em tiles (arqueiros)
  era?: number; // era em que é liberada (0 = Era I)
}

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  villager: {
    name: 'Aldeão', nameFeminine: 'Aldeã', maxHp: 25, radius: 6, speed: 52, cost: { food: 50 }, trainTime: 20,
    canGather: true, canBuild: true, carryCapacity: 10, attack: 2, attackCooldown: 1.5, autoAttack: false, military: false,
    hotkey: 'KeyQ',
  },
  scout: {
    name: 'Batedor', nameFeminine: 'Batedora', maxHp: 45, radius: 9, speed: 120, cost: { food: 80 }, trainTime: 30,
    canGather: false, canBuild: false, carryCapacity: 0, attack: 3, attackCooldown: 1.5, autoAttack: false, military: true,
    hotkey: 'KeyW',
  },
  militia: {
    name: 'Miliciano', nameFeminine: 'Miliciana', maxHp: 60, radius: 7, speed: 55, cost: { food: 40, wood: 25 }, trainTime: 25,
    canGather: false, canBuild: false, carryCapacity: 0, attack: 7, attackCooldown: 1.5, autoAttack: true, military: true,
    hotkey: 'KeyE',
  },
  spearman: {
    name: 'Lanceiro', nameFeminine: 'Lanceira', maxHp: 95, radius: 7, speed: 56, cost: { food: 60, wood: 30, iron: 15 }, trainTime: 30,
    canGather: false, canBuild: false, carryCapacity: 0, attack: 11, attackCooldown: 1.4, autoAttack: true, military: true,
    hotkey: 'KeyE', era: 1,
  },
  archer: {
    name: 'Arqueiro', nameFeminine: 'Arqueira', maxHp: 45, radius: 7, speed: 54, cost: { food: 40, wood: 45 }, trainTime: 28,
    canGather: false, canBuild: false, carryCapacity: 0, attack: 6, attackCooldown: 1.8, autoAttack: true, military: true,
    hotkey: 'KeyE', range: 6, era: 1,
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

// "o aldeão Otto Bauer" / "a aldeã Greta Wolf"
export function unitNoun(kind: UnitKind, female: boolean): string {
  const def = UNIT_DEFS[kind];
  return female ? def.nameFeminine : def.name;
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

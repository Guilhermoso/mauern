import type { BuildingKind } from '../entities/types';
import type { Cost } from './defs';

// Tecnologias e relíquias alteram o jogo através de modificadores (ver systems/modifiers.ts).
// Multiplicadores somam (0.2 = +20%); valores "flat" somam direto.
export type ModKey =
  | 'gatherWood'
  | 'gatherFood'
  | 'gatherStone' // pedra e ferro
  | 'farm'
  | 'winterFarm' // fração da produção da fazenda no inverno
  | 'carry' // flat: capacidade de carga
  | 'build'
  | 'research'
  | 'foodUse'
  | 'winterWood'
  | 'wallHp'
  | 'tcHp'
  | 'arrowDamage' // flat
  | 'towerRange' // flat, em tiles
  | 'militiaAttack' // flat
  | 'militiaHp' // flat
  | 'taxes'
  | 'morale' // flat
  | 'wellRadius'; // flat, em tiles

export type Effects = Partial<Record<ModKey, number>>;

export interface TechDef {
  name: string;
  description: string;
  building: BuildingKind; // onde é pesquisada
  cost: Cost;
  time: number; // segundos (velocidade 1x; um dia de jogo = 240 s)
  requires?: TechId[];
  effects: Effects;
  era: number;
}

export type TechId =
  | 'sharpAxes'
  | 'wickerBaskets'
  | 'pickaxes'
  | 'woodenPlow'
  | 'cropRotation'
  | 'preserves'
  | 'reinforcedPalisade'
  | 'fireArrows'
  | 'militiaDrill'
  | 'sentinels'
  | 'hearths'
  | 'buildingTools';

export const TECH_DEFS: Record<TechId, TechDef> = {
  sharpAxes: {
    name: 'Machados Afiados', description: 'Corte de madeira 20% mais rápido.',
    building: 'lumberCamp', cost: { food: 100, wood: 50 }, time: 120, effects: { gatherWood: 0.2 }, era: 0,
  },
  pickaxes: {
    name: 'Picaretas', description: 'Mineração de pedra e ferro 20% mais rápida.',
    building: 'miningCamp', cost: { food: 100, wood: 75 }, time: 150, effects: { gatherStone: 0.2 }, era: 0,
  },
  woodenPlow: {
    name: 'Arado de Madeira', description: 'Fazendas produzem 20% mais.',
    building: 'mill', cost: { food: 75, wood: 100 }, time: 150, effects: { farm: 0.2 }, era: 0,
  },
  cropRotation: {
    name: 'Rotação de Culturas', description: 'As fazendas produzem um pouco (30%) mesmo no inverno.',
    building: 'mill', cost: { food: 200, wood: 150, gold: 40 }, time: 300, requires: ['woodenPlow'], effects: { winterFarm: 0.3 }, era: 0,
  },
  wickerBaskets: {
    name: 'Cestos de Vime', description: 'Aldeões carregam 5 a mais por viagem.',
    building: 'townCenter', cost: { food: 120, wood: 80 }, time: 180, effects: { carry: 5 }, era: 0,
  },
  preserves: {
    name: 'Conservas', description: 'A população consome 20% menos comida.',
    building: 'townCenter', cost: { food: 150, wood: 100, gold: 30 }, time: 240, effects: { foodUse: -0.2 }, era: 0,
  },
  hearths: {
    name: 'Lareiras', description: 'As casas gastam metade da lenha no inverno.',
    building: 'townCenter', cost: { wood: 150, stone: 75 }, time: 240, effects: { winterWood: -0.5 }, era: 0,
  },
  buildingTools: {
    name: 'Ferramentas de Construção', description: 'Construção e reparo 25% mais rápidos.',
    building: 'townCenter', cost: { food: 100, wood: 150 }, time: 200, effects: { build: 0.25 }, era: 0,
  },
  reinforcedPalisade: {
    name: 'Paliçada Reforçada', description: 'Paliçadas e portões com 50% mais vida.',
    building: 'lumberCamp', cost: { wood: 250, stone: 50 }, time: 300, effects: { wallHp: 0.5 }, era: 0,
  },
  militiaDrill: {
    name: 'Treino de Milícia', description: 'Milicianos com +20 de vida e +2 de ataque.',
    building: 'townCenter', cost: { food: 200, wood: 100, gold: 25 }, time: 300, effects: { militiaHp: 20, militiaAttack: 2 }, era: 0,
  },
  fireArrows: {
    name: 'Flechas de Fogo', description: 'Torres e Centro da Vila causam +2 de dano por flecha.',
    building: 'watchTower', cost: { food: 100, wood: 200, gold: 30 }, time: 300, effects: { arrowDamage: 2 }, era: 0,
  },
  sentinels: {
    name: 'Sentinelas', description: 'Torres atiram 2 tiles mais longe.',
    building: 'watchTower', cost: { food: 150, wood: 150, stone: 50 }, time: 240, effects: { towerRange: 2 }, era: 0,
  },
};

export const TECH_IDS = Object.keys(TECH_DEFS) as TechId[];

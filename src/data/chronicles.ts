import type { GameState } from '../state';
import type { Effects } from './techs';
import { ticksPerDay } from '../core/time';

// Crônicas: objetivos opcionais de cada era. Cumprir uma crônica dá uma relíquia com bônus permanente.

export interface ChronicleDef {
  name: string;
  description: string;
  relic: string;
  relicDescription: string;
  effects: Effects;
  era: number;
  check(s: GameState): boolean;
}

const count = (s: GameState, f: (b: GameState['buildings'][number]) => boolean) => s.buildings.filter(f).length;

export const CHRONICLES: Record<string, ChronicleDef> = {
  handsAtWork: {
    name: 'Mãos à Obra', description: 'Tenha 15 aldeões.',
    relic: 'Martelo do Fundador', relicDescription: 'Construção 5% mais rápida.', effects: { build: 0.05 }, era: 0,
    check: (s) => s.units.filter((u) => u.kind === 'villager').length >= 15,
  },
  firstBlood: {
    name: 'Primeiro Sangue', description: 'Abata o primeiro titã.',
    relic: 'Dente de Titã', relicDescription: 'Milicianos com +1 de ataque.', effects: { militiaAttack: 1 }, era: 0,
    check: (s) => s.stats.titansKilled >= 1,
  },
  giantHunters: {
    name: 'Caçadores de Gigantes', description: 'Abata 15 titãs.',
    relic: 'Arco do Vigia', relicDescription: '+1 de dano por flecha.', effects: { arrowDamage: 1 }, era: 0,
    check: (s) => s.stats.titansKilled >= 15,
  },
  fullGranary: {
    name: 'Celeiro Cheio', description: 'Tenha 1000 de comida estocada.',
    relic: 'Jarro de Barro', relicDescription: 'Consumo de comida 5% menor.', effects: { foodUse: -0.05 }, era: 0,
    check: (s) => s.resources.food >= 1000,
  },
  livingWall: {
    name: 'Muralha Viva', description: 'Tenha 60 segmentos de paliçada.',
    relic: 'Estaca Antiga', relicDescription: 'Paliçadas com 10% mais vida.', effects: { wallHp: 0.1 }, era: 0,
    check: (s) => count(s, (b) => b.kind === 'palisade' && b.built) >= 60,
  },
  vigil: {
    name: 'Vigília', description: 'Tenha 3 torres de vigia.',
    relic: 'Luneta de Bronze', relicDescription: 'Torres atiram 1 tile mais longe.', effects: { towerRange: 1 }, era: 0,
    check: (s) => count(s, (b) => b.kind === 'watchTower' && b.built) >= 3,
  },
  prosperous: {
    name: 'Bairro Próspero', description: 'Tenha 5 casas de pedra.',
    relic: 'Chave da Cidade', relicDescription: 'Impostos 20% maiores.', effects: { taxes: 0.2 }, era: 0,
    check: (s) => count(s, (b) => b.kind === 'house' && b.level >= 3) >= 5,
  },
  noSoulLost: {
    name: 'Nenhuma Alma Perdida', description: 'Repila um Grande Ataque sem nenhuma morte.',
    relic: 'Sino de Prata', relicDescription: '+5 de moral permanente.', effects: { morale: 5 }, era: 0,
    check: (s) => s.stats.flawlessHordes >= 1,
  },
  lumberjacks: {
    name: 'Lenhadores', description: 'Colete 2000 de madeira ao todo.',
    relic: 'Machado Gasto', relicDescription: 'Madeira 5% mais rápida.', effects: { gatherWood: 0.05 }, era: 0,
    check: (s) => s.stats.gathered.wood >= 2000,
  },
  masons: {
    name: 'Pedreiros', description: 'Colete 1000 de pedra ao todo.',
    relic: 'Cinzel de Ferro', relicDescription: 'Pedra e ferro 5% mais rápidos.', effects: { gatherStone: 0.05 }, era: 0,
    check: (s) => s.stats.gathered.stone >= 1000,
  },
  plenty: {
    name: 'Fartura', description: 'Colete 3000 de comida ao todo.',
    relic: 'Foice Dourada', relicDescription: 'Fazendas 5% mais produtivas.', effects: { farm: 0.05 }, era: 0,
    check: (s) => s.stats.gathered.food >= 3000,
  },
  scholars: {
    name: 'Sábios', description: 'Pesquise 6 tecnologias.',
    relic: 'Pergaminho Velho', relicDescription: 'Pesquisa 10% mais rápida.', effects: { research: 0.1 }, era: 0,
    check: (s) => s.techs.length >= 6,
  },
  firmHeart: {
    name: 'Coração Firme', description: 'Mantenha a moral em 80 ou mais por 3 dias seguidos.',
    relic: 'Estandarte Bordado', relicDescription: '+3 de moral permanente.', effects: { morale: 3 }, era: 0,
    check: (s) => s.stats.moraleHighHours >= 72,
  },
  firstWinter: {
    name: 'Primeiro Inverno', description: 'Sobreviva ao primeiro inverno.',
    relic: 'Manto de Lã', relicDescription: 'Casas gastam 25% menos lenha no inverno.', effects: { winterWood: -0.25 }, era: 0,
    check: (s) => s.stats.wintersSurvived >= 1,
  },
  noHunger: {
    name: 'Sem Fome', description: 'Atravesse um inverno inteiro sem faltar comida.',
    relic: 'Celeiro Abençoado', relicDescription: 'Consumo de comida 5% menor.', effects: { foodUse: -0.05 }, era: 0,
    check: (s) => s.stats.wintersWithoutHunger >= 1,
  },
  cityStands: {
    name: 'A Cidade Resiste', description: 'Sobreviva 30 dias.',
    relic: 'Pedra Fundamental', relicDescription: 'Centro da Vila com 20% mais vida.', effects: { tcHp: 0.2 }, era: 0,
    check: (s) => s.tick >= 30 * ticksPerDay(),
  },
};

export type ChronicleId = keyof typeof CHRONICLES;
export const CHRONICLE_IDS = Object.keys(CHRONICLES);

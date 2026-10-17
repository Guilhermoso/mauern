// Estruturas de dados das entidades. São objetos simples e serializáveis,
// referenciados por ID (sem referências circulares) para facilitar o save.

export type ResourceKind = 'food' | 'wood' | 'stone' | 'iron' | 'gold';
export type Resources = Record<ResourceKind, number>;

export type ResourceNodeKind = 'tree' | 'berries' | 'stone' | 'iron' | 'crystal';

export interface ResourceNode {
  id: number;
  kind: ResourceNodeKind;
  tx: number;
  ty: number;
  amount: number;
  variant: number; // variação visual estável
}

export type BuildingKind =
  | 'townCenter'
  | 'house'
  | 'lumberCamp'
  | 'miningCamp'
  | 'mill'
  | 'farm'
  | 'palisade'
  | 'gate'
  | 'watchTower';

export interface TrainItem {
  kind: UnitKind;
  progress: number; // segundos já treinados
}

export interface RallyPoint {
  tx: number;
  ty: number;
  nodeId?: number; // se o ponto de reunião for um recurso, os aldeões vão coletá-lo
}

export interface Building {
  id: number;
  kind: BuildingKind;
  tx: number; // canto superior esquerdo, em tiles
  ty: number;
  hp: number;
  built: boolean;
  progress: number; // segundos de construção já feitos
  queue: TrainItem[];
  rally: RallyPoint | null;
  farmerId: number; // fazendas: aldeão que trabalha nela (0 = nenhum)
  attackCooldown: number; // segundos até a próxima flecha
}

export type UnitKind = 'villager' | 'scout' | 'militia';

export interface Carry {
  kind: ResourceKind;
  amount: number;
}

export type GatherPhase = 'collect' | 'drop';

export type UnitOrder =
  | { type: 'idle' }
  | { type: 'move'; tx: number; ty: number }
  // tx/ty: última posição conhecida do recurso, para procurar outro igual por perto quando ele acabar
  | { type: 'gather'; nodeId: number; nodeKind: ResourceNodeKind; tx: number; ty: number; phase: GatherPhase; avoid: number[] }
  | { type: 'farm'; buildingId: number; phase: GatherPhase }
  | { type: 'build'; buildingId: number }
  | { type: 'deliver'; buildingId: number }
  | { type: 'attack'; titanId: number }
  | { type: 'garrison'; buildingId: number };

export interface Unit {
  id: number;
  kind: UnitKind;
  name: string;
  x: number; // em pixels de mundo
  y: number;
  hp: number;
  facing: number; // ângulo em radianos
  order: UnitOrder;
  path: number[]; // waypoints (índices de tile) ainda a percorrer
  pathKey: string; // destino para o qual o caminho foi calculado
  pathComplete: boolean; // false se o caminho só chega perto do destino
  carry: Carry | null;
  work: number; // acumulador de trabalho (coleta)
  moving: boolean;
  garrison: number; // edifício onde está abrigada (0 = fora)
  attackCooldown: number;
  prevOrder: UnitOrder | null; // ordem a retomar quando o sino de alarme for desligado
}

export type TitanKind = 'common';

export interface Titan {
  id: number;
  kind: TitanKind;
  height: number; // em metros; define vida, dano, tamanho e velocidade
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  targetKind: 'unit' | 'building' | 'march' | 'none';
  targetId: number;
  path: number[];
  pathKey: string;
  repathTick: number; // não recalcula o caminho antes deste tick
  retargetTick: number;
  attackCooldown: number;
  lastHitTick: number; // para o efeito visual de dano
  sighted: boolean; // já foi anunciado ao jogador
  skin: number; // variação de cor
}

export interface ThreatState {
  nextSpawnTick: number;
  nextGreatAttackDay: number;
  greatAttackAnnounced: boolean;
  greatAttackDir: number; // ângulo de onde vem a horda
}

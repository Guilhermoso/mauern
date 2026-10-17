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

export type BuildingKind = 'townCenter';

export interface Building {
  id: number;
  kind: BuildingKind;
  tx: number; // canto superior esquerdo, em tiles
  ty: number;
  hp: number;
}

export type UnitKind = 'villager' | 'scout';

export interface Unit {
  id: number;
  kind: UnitKind;
  name: string;
  x: number; // em pixels de mundo
  y: number;
  hp: number;
  facing: number; // ângulo em radianos
}

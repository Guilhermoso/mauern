import type { BuildingKind, UnitKind } from './types';

export interface BuildingDef {
  name: string;
  size: number; // lado em tiles
  maxHp: number;
  housing: number;
}

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  townCenter: { name: 'Centro da Vila', size: 4, maxHp: 2400, housing: 5 },
};

export interface UnitDef {
  name: string;
  maxHp: number;
  radius: number;
}

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  villager: { name: 'Aldeão', maxHp: 25, radius: 6 },
  scout: { name: 'Batedor', maxHp: 45, radius: 9 },
};

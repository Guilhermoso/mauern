import { TILE_INFO, Tile } from './terrain';
import type { ResourceNode } from '../entities/types';

export interface World {
  width: number;
  height: number;
  tiles: Uint8Array;
  resourceNodes: ResourceNode[];
}

export function inBounds(world: World, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < world.width && ty < world.height;
}

export function getTile(world: World, tx: number, ty: number): Tile {
  if (!inBounds(world, tx, ty)) return Tile.DeepWater;
  return world.tiles[ty * world.width + tx] as Tile;
}

export function setTile(world: World, tx: number, ty: number, tile: Tile): void {
  if (inBounds(world, tx, ty)) world.tiles[ty * world.width + tx] = tile;
}

export function isWalkable(world: World, tx: number, ty: number): boolean {
  return TILE_INFO[getTile(world, tx, ty)].walkable;
}

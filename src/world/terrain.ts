export const enum Tile {
  Grass = 0,
  Dirt = 1,
  Forest = 2,
  Water = 3,
  Rock = 4,
  Sand = 5,
  DeepWater = 6,
}

export interface TileInfo {
  name: string;
  color: number;
  walkable: boolean;
  buildable: boolean;
}

export const TILE_INFO: Record<number, TileInfo> = {
  [Tile.Grass]: { name: 'Grama', color: 0x5f8f3e, walkable: true, buildable: true },
  [Tile.Dirt]: { name: 'Terra', color: 0x8a7148, walkable: true, buildable: true },
  [Tile.Forest]: { name: 'Floresta', color: 0x3f6b2c, walkable: true, buildable: false },
  // Água rasa: humanos não passam, mas titãs de 4 m ou mais atravessam devagar.
  [Tile.Water]: { name: 'Água rasa', color: 0x5a93b8, walkable: false, buildable: false },
  [Tile.Rock]: { name: 'Rocha', color: 0x77736b, walkable: false, buildable: false },
  [Tile.Sand]: { name: 'Areia', color: 0xc9b47c, walkable: true, buildable: true },
  [Tile.DeepWater]: { name: 'Água funda', color: 0x26507c, walkable: false, buildable: false },
};

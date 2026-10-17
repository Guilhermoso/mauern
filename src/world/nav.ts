import { TILE_INFO } from './terrain';
import type { World } from './world';

// Grade de navegação: diz quais tiles podem ser atravessados. É derivada do estado
// (terreno + recursos + edifícios) e nunca é salva; é reconstruída ao carregar o jogo.

export class NavGrid {
  readonly width: number;
  readonly height: number;
  private terrain: Uint8Array; // 1 = terreno intransponível
  private occ: Uint16Array; // quantos objetos ocupam o tile

  constructor(world: World) {
    this.width = world.width;
    this.height = world.height;
    this.terrain = new Uint8Array(world.width * world.height);
    this.occ = new Uint16Array(world.width * world.height);
    for (let i = 0; i < world.tiles.length; i++) this.terrain[i] = TILE_INFO[world.tiles[i]].walkable ? 0 : 1;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isFree(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    return this.terrain[i] === 0 && this.occ[i] === 0;
  }

  setTerrainWalkable(x: number, y: number, walkable: boolean): void {
    if (this.inBounds(x, y)) this.terrain[y * this.width + x] = walkable ? 0 : 1;
  }

  occupy(x: number, y: number, w = 1, h = 1): void {
    this.addOcc(x, y, w, h, 1);
  }

  release(x: number, y: number, w = 1, h = 1): void {
    this.addOcc(x, y, w, h, -1);
  }

  private addOcc(x: number, y: number, w: number, h: number, delta: number): void {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const i = ty * this.width + tx;
        this.occ[i] = Math.max(0, this.occ[i] + delta);
      }
    }
  }
}

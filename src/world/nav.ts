import { TILE_INFO } from './terrain';
import type { World } from './world';

// Grade de navegação: diz quais tiles podem ser atravessados. É derivada do estado
// (terreno + recursos + edifícios) e nunca é salva; é reconstruída ao carregar o jogo.

export class NavGrid {
  readonly width: number;
  readonly height: number;
  private terrain: Uint8Array; // 1 = terreno intransponível
  private occ: Uint16Array; // quantos objetos ocupam o tile
  // Regiões: tiles livres ligados entre si recebem o mesmo número. Duas posições em regiões
  // diferentes não têm caminho entre elas. Recalculado só quando a grade muda.
  private version = 0;
  private regionsVersion = -1;
  private regions: Int32Array;

  constructor(world: World) {
    this.width = world.width;
    this.height = world.height;
    this.terrain = new Uint8Array(world.width * world.height);
    this.occ = new Uint16Array(world.width * world.height);
    for (let i = 0; i < world.tiles.length; i++) this.terrain[i] = TILE_INFO[world.tiles[i]].walkable ? 0 : 1;
    this.regions = new Int32Array(world.width * world.height);
  }

  // Região do tile (0 = bloqueado). O movimento diagonal exige os dois lados livres, então
  // a ligação em 4 direções é exatamente a mesma coisa que "existe caminho".
  regionAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    if (this.regionsVersion !== this.version) this.computeRegions();
    return this.regions[y * this.width + x];
  }

  private computeRegions(): void {
    const w = this.width;
    const n = w * this.height;
    const reg = this.regions;
    reg.fill(0);
    const stack = new Int32Array(n);
    let next = 1;
    for (let i = 0; i < n; i++) {
      if (reg[i] || this.terrain[i] || this.occ[i]) continue;
      let top = 0;
      stack[top++] = i;
      reg[i] = next;
      while (top > 0) {
        const c = stack[--top];
        const x = c % w;
        const neigh = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w];
        for (const k of neigh) {
          if (k < 0 || k >= n || reg[k] || this.terrain[k] || this.occ[k]) continue;
          reg[k] = next;
          stack[top++] = k;
        }
      }
      next++;
    }
    this.regionsVersion = this.version;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isFree(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    return this.terrain[i] === 0 && this.occ[i] === 0;
  }

  isTerrainWalkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.terrain[y * this.width + x] === 0;
  }

  setTerrainWalkable(x: number, y: number, walkable: boolean): void {
    if (this.inBounds(x, y)) this.terrain[y * this.width + x] = walkable ? 0 : 1;
    this.version++;
  }

  occupy(x: number, y: number, w = 1, h = 1): void {
    this.addOcc(x, y, w, h, 1);
  }

  release(x: number, y: number, w = 1, h = 1): void {
    this.addOcc(x, y, w, h, -1);
  }

  private addOcc(x: number, y: number, w: number, h: number, delta: number): void {
    this.version++;
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (!this.inBounds(tx, ty)) continue;
        const i = ty * this.width + tx;
        this.occ[i] = Math.max(0, this.occ[i] + delta);
      }
    }
  }
}

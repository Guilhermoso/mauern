import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { hash2 } from '../core/rng';
import { TILE_INFO, Tile } from '../world/terrain';
import { getTile, type World } from '../world/world';
import type { ResourceNode } from '../entities/types';
import { shade } from './colors';

// O terreno é dividido em blocos (chunks). Cada bloco é desenhado uma vez, sob demanda,
// e "assado" em texturas: uma para o chão e outra (com margem) para árvores e jazidas,
// que podem ultrapassar a borda do bloco. Assim cada bloco custa só dois sprites por quadro.
// Blocos fora da tela são descartados quando há blocos demais na memória.

const CHUNK = 16; // tiles por lado
const PAD = 32; // margem da textura de objetos, em pixels de mundo
const GROUND_RESOLUTION = 0.5;
const MAX_CHUNKS = 100;

interface Chunk {
  ground: Sprite;
  objects: Sprite;
  lastSeen: number;
}

export class TerrainLayer {
  readonly container = new Container();
  private groundLayer = new Container();
  private objectLayer = new Container();
  private chunks = new Map<number, Chunk>();
  private nodesByChunk: ResourceNode[][] = [];
  private cols: number;
  private rows: number;
  private frame = 0;

  constructor(private world: World, private seed: number, private renderer: Renderer) {
    this.cols = Math.ceil(world.width / CHUNK);
    this.rows = Math.ceil(world.height / CHUNK);
    this.container.addChild(this.groundLayer, this.objectLayer);
    this.indexNodes();
  }

  private indexNodes(): void {
    this.nodesByChunk = Array.from({ length: this.cols * this.rows }, () => []);
    for (const n of this.world.resourceNodes) {
      const ci = Math.floor(n.ty / CHUNK) * this.cols + Math.floor(n.tx / CHUNK);
      this.nodesByChunk[ci].push(n);
    }
  }

  // Redesenha os blocos onde o terreno ou os recursos mudaram.
  markDirty(tiles: { tx: number; ty: number }[]): void {
    if (!tiles.length) return;
    this.indexNodes();
    const chunks = new Set<number>();
    for (const { tx, ty } of tiles) {
      chunks.add(Math.floor(ty / CHUNK) * this.cols + Math.floor(tx / CHUNK));
    }
    for (const c of chunks) this.dropChunk(c);
  }

  private dropChunk(index: number): void {
    const c = this.chunks.get(index);
    if (!c) return;
    c.ground.destroy({ texture: true, textureSource: true });
    c.objects.destroy({ texture: true, textureSource: true });
    this.chunks.delete(index);
  }

  update(view: { x: number; y: number; w: number; h: number }): void {
    this.frame++;
    const size = CHUNK * BALANCE.world.tileSize;
    const minCx = Math.max(0, Math.floor(view.x / size));
    const minCy = Math.max(0, Math.floor(view.y / size));
    const maxCx = Math.min(this.cols - 1, Math.floor((view.x + view.w) / size));
    const maxCy = Math.min(this.rows - 1, Math.floor((view.y + view.h) / size));

    for (const c of this.chunks.values()) {
      c.ground.visible = false;
      c.objects.visible = false;
    }
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const i = cy * this.cols + cx;
        let c = this.chunks.get(i);
        if (!c) {
          c = this.buildChunk(cx, cy);
          this.chunks.set(i, c);
        }
        c.ground.visible = true;
        c.objects.visible = true;
        c.lastSeen = this.frame;
      }
    }

    if (this.chunks.size > MAX_CHUNKS) {
      const old = [...this.chunks.entries()]
        .filter(([, c]) => c.lastSeen !== this.frame)
        .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      for (let k = 0; k < old.length && this.chunks.size > MAX_CHUNKS; k++) this.dropChunk(old[k][0]);
    }
  }

  private bake(content: Container, x: number, y: number, w: number, h: number, resolution: number): Sprite {
    const rt = RenderTexture.create({ width: w, height: h, resolution, antialias: true });
    content.position.set(-x, -y);
    this.renderer.render({ container: content, target: rt, clear: true });
    content.destroy({ children: true });
    const sprite = new Sprite(rt);
    sprite.position.set(x, y);
    return sprite;
  }

  private buildChunk(cx: number, cy: number): Chunk {
    const ts = BALANCE.world.tileSize;
    const size = CHUNK * ts;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;

    const groundContent = new Container();
    const ground = new Graphics();
    const details = new Graphics();
    for (let ty = y0; ty < Math.min(y0 + CHUNK, this.world.height); ty++) {
      for (let tx = x0; tx < Math.min(x0 + CHUNK, this.world.width); tx++) {
        const tile = getTile(this.world, tx, ty);
        const h = hash2(tx, ty, this.seed);
        const base = TILE_INFO[tile].color;
        ground.rect(tx * ts, ty * ts, ts, ts).fill(shade(base, 0.97 + h * 0.06));
        this.drawTileDetail(details, tile, tx, ty, h);
      }
    }
    groundContent.addChild(ground, details);

    const objectContent = new Container();
    const nodes = new Graphics();
    // Desenha de cima para baixo para que as copas se sobreponham corretamente.
    const sorted = [...this.nodesByChunk[cy * this.cols + cx]].sort((a, b) => a.ty - b.ty || a.tx - b.tx);
    for (const n of sorted) drawResourceNode(nodes, n);
    objectContent.addChild(nodes);

    const chunk: Chunk = {
      ground: this.bake(groundContent, x0 * ts, y0 * ts, size, size, GROUND_RESOLUTION),
      objects: this.bake(objectContent, x0 * ts - PAD, y0 * ts - PAD, size + PAD * 2, size + PAD * 2, 1),
      lastSeen: this.frame,
    };
    this.groundLayer.addChild(chunk.ground);
    this.objectLayer.addChild(chunk.objects);
    return chunk;
  }

  private drawTileDetail(g: Graphics, tile: Tile, tx: number, ty: number, h: number): void {
    const ts = BALANCE.world.tileSize;
    const px = tx * ts;
    const py = ty * ts;
    const h2 = hash2(tx, ty, this.seed + 99);
    switch (tile) {
      case Tile.Grass:
        if (h > 0.55) {
          const c = shade(TILE_INFO[Tile.Grass].color, 1.18);
          g.rect(px + h2 * 24 + 2, py + h * 20 + 4, 2, 5).fill(c);
          g.rect(px + h2 * 24 + 5, py + h * 20 + 6, 2, 4).fill(c);
        }
        if (h > 0.96) {
          g.circle(px + h2 * 26 + 3, py + 10, 2).fill(h2 > 0.5 ? 0xe8d64a : 0xe6e0f0);
        }
        break;
      case Tile.Dirt:
        if (h > 0.6) g.circle(px + h2 * 26 + 3, py + h * 26 + 3, 1.6).fill(shade(TILE_INFO[Tile.Dirt].color, 0.75));
        break;
      case Tile.Sand:
        if (h > 0.7) g.circle(px + h2 * 26 + 3, py + h * 26 + 3, 1.2).fill(shade(TILE_INFO[Tile.Sand].color, 0.85));
        break;
      case Tile.Water:
      case Tile.DeepWater:
        if (h > 0.75) {
          g.rect(px + h2 * 18 + 3, py + h * 24 + 3, 9, 1.5).fill({ color: 0xffffff, alpha: 0.18 });
        }
        break;
      case Tile.Rock:
        g.poly([px + 4, py + 26, px + 10 + h * 6, py + 6 + h2 * 4, px + 28, py + 24]).fill(shade(TILE_INFO[Tile.Rock].color, 1.15));
        g.poly([px + 10 + h * 6, py + 6 + h2 * 4, px + 28, py + 24, px + 18, py + 26]).fill(shade(TILE_INFO[Tile.Rock].color, 0.8));
        break;
      default:
        break;
    }
  }
}

export function drawResourceNode(g: Graphics, n: ResourceNode): void {
  const ts = BALANCE.world.tileSize;
  const v = n.variant;
  const cx = n.tx * ts + ts / 2 + (v - 0.5) * 8;
  const cy = n.ty * ts + ts / 2 + ((v * 7) % 1 - 0.5) * 8;
  switch (n.kind) {
    case 'tree': {
      const r = 12 + v * 6;
      g.ellipse(cx + 5, cy + 6, r, r * 0.8).fill({ color: 0x000000, alpha: 0.25 });
      const dark = v > 0.5 ? 0x2c5a24 : 0x2f6129;
      g.circle(cx, cy, r).fill(dark);
      g.circle(cx - r * 0.25, cy - r * 0.25, r * 0.65).fill(shade(dark, 1.25));
      g.circle(cx - r * 0.4, cy - r * 0.4, r * 0.3).fill(shade(dark, 1.5));
      break;
    }
    case 'berries': {
      g.ellipse(cx + 3, cy + 4, 11, 8).fill({ color: 0x000000, alpha: 0.2 });
      g.circle(cx, cy, 10).fill(0x3d7a32);
      g.circle(cx - 3, cy - 3, 6).fill(0x4f9440);
      for (let i = 0; i < 6; i++) {
        const a = v * 10 + i * 1.1;
        g.circle(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, 2).fill(0xc8283c);
      }
      break;
    }
    case 'stone':
    case 'iron': {
      const base = n.kind === 'stone' ? 0x9a968c : 0x5d5652;
      g.ellipse(cx + 3, cy + 5, 13, 9).fill({ color: 0x000000, alpha: 0.25 });
      g.poly([cx - 12, cy + 6, cx - 8, cy - 8, cx + 4, cy - 11, cx + 12, cy - 2, cx + 9, cy + 9, cx - 4, cy + 10]).fill(base);
      g.poly([cx - 8, cy - 8, cx + 4, cy - 11, cx + 12, cy - 2, cx, cy]).fill(shade(base, 1.2));
      if (n.kind === 'iron') {
        g.circle(cx - 3, cy + 3, 2.2).fill(0xb5602b);
        g.circle(cx + 5, cy - 3, 1.8).fill(0xb5602b);
        g.circle(cx + 2, cy + 6, 1.5).fill(0xb5602b);
      }
      break;
    }
    case 'crystal': {
      g.ellipse(cx + 3, cy + 6, 10, 6).fill({ color: 0x000000, alpha: 0.25 });
      g.poly([cx, cy - 13, cx + 6, cy, cx, cy + 8, cx - 6, cy]).fill(0x5fd3e6);
      g.poly([cx, cy - 13, cx + 6, cy, cx, cy]).fill(0xb6f2fb);
      g.poly([cx - 9, cy - 4, cx - 5, cy + 3, cx - 9, cy + 7, cx - 12, cy + 2]).fill(0x3fb0c8);
      break;
    }
  }
}

import { BALANCE } from '../data/balance';
import { TILE_INFO } from '../world/terrain';
import type { GameState } from '../state';
import type { Camera } from '../render/camera';
import { BUILDING_DEFS } from '../data/defs';

// Minimapa clicável: terreno pré-desenhado em um canvas fora da tela,
// com unidades, edifícios e o retângulo da câmera desenhados por cima.

export class Minimap {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private baseDirty = true;

  constructor(private state: GameState, private camera: Camera) {
    this.el = document.createElement('div');
    this.el.className = 'minimap panel';
    this.canvas = document.createElement('canvas');
    this.canvas.width = state.world.width;
    this.canvas.height = state.world.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.el.appendChild(this.canvas);
    this.base = document.createElement('canvas');
    this.base.width = state.world.width;
    this.base.height = state.world.height;

    let dragging = false;
    const moveTo = (e: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const ts = BALANCE.world.tileSize;
      this.camera.centerOn(fx * state.world.width * ts, fy * state.world.height * ts);
    };
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moveTo(e);
    });
    window.addEventListener('mousemove', (e) => dragging && moveTo(e));
    window.addEventListener('mouseup', () => (dragging = false));
  }

  markDirty(): void {
    this.baseDirty = true;
  }

  private drawBase(): void {
    const { world } = this.state;
    const ctx = this.base.getContext('2d')!;
    const img = ctx.createImageData(world.width, world.height);
    for (let i = 0; i < world.tiles.length; i++) {
      const c = TILE_INFO[world.tiles[i]].color;
      img.data[i * 4] = (c >> 16) & 0xff;
      img.data[i * 4 + 1] = (c >> 8) & 0xff;
      img.data[i * 4 + 2] = c & 0xff;
      img.data[i * 4 + 3] = 255;
    }
    const colors: Record<string, [number, number, number]> = {
      tree: [38, 78, 32], berries: [200, 60, 70], stone: [190, 186, 176], iron: [150, 90, 60], crystal: [95, 211, 230],
    };
    for (const n of world.resourceNodes) {
      const i = (n.ty * world.width + n.tx) * 4;
      const [r, g, b] = colors[n.kind];
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
    this.baseDirty = false;
  }

  draw(): void {
    if (this.baseDirty) this.drawBase();
    const ctx = this.ctx;
    const ts = BALANCE.world.tileSize;
    ctx.drawImage(this.base, 0, 0);
    ctx.fillStyle = '#4f8cff';
    for (const b of this.state.buildings) {
      const s = BUILDING_DEFS[b.kind].size;
      ctx.fillRect(b.tx, b.ty, s, s);
    }
    for (const u of this.state.units) if (!u.garrison) ctx.fillRect(u.x / ts - 1, u.y / ts - 1, 2, 2);
    ctx.fillStyle = '#ff3b2f';
    for (const t of this.state.titans) ctx.fillRect(t.x / ts - 1.5, t.y / ts - 1.5, 3, 3);
    const v = this.camera.viewRect();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(v.x / ts + 0.5, v.y / ts + 0.5, v.w / ts, v.h / ts);
  }
}

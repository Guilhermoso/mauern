import { Sprite, Texture } from 'pixi.js';
import { BALANCE } from '../data/balance';
import type { Sim } from '../core/sim';

// Névoa de guerra na tela: uma textura de 1 pixel por tile, esticada sobre o mapa e suavizada
// (bordas macias). Preto onde nunca se viu; esmaecido onde já se viu mas não há ninguém olhando agora.
export class FogLayer {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private texture: Texture;
  private version = -1;

  constructor(private sim: Sim) {
    const w = sim.state.world.width;
    const h = sim.state.world.height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(w, h);
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'linear';
    this.sprite = new Sprite(this.texture);
    this.sprite.scale.set(BALANCE.world.tileSize);
  }

  update(): void {
    const sim = this.sim;
    if (sim.fogVersion === this.version) return;
    this.version = sim.fogVersion;
    const explored = sim.state.explored;
    const vis = sim.visible;
    const d = this.img.data;
    for (let i = 0; i < explored.length; i++) {
      const o = i * 4;
      d[o] = 8;
      d[o + 1] = 10;
      d[o + 2] = 16;
      d[o + 3] = vis[i] ? 0 : explored[i] ? 120 : 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.texture.source.update();
  }
}

import { AlphaFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { daylight } from '../core/time';
import { lerpColor } from './colors';
import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { GameState } from '../state';
import type { Camera } from './camera';

// Fontes de luz à noite: raio em tiles e intensidade (0–1).
const LIGHTS: Partial<Record<string, { radius: number; strength: number }>> = {
  bonfire: { radius: 6, strength: 1 },
  townCenter: { radius: 4, strength: 0.75 },
  watchTower: { radius: 3, strength: 0.7 },
};

// Gradiente radial (branco no centro, transparente na borda), usado para os buracos de luz e o brilho.
function radialTexture(): Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

// Camada de iluminação em espaço de tela: escurece à noite, dá um tom quente no amanhecer e no
// anoitecer, e as fogueiras (e tochas do Centro da Vila e das torres) abrem áreas de luz na escuridão.
export class Lighting {
  readonly overlay = new Container();
  private darkness = new Container(); // escuridão com os "buracos" de luz apagados
  private shade = new Graphics();
  private holes: Sprite[] = [];
  private glows: Sprite[] = [];
  private glowLayer = new Container();
  private tex = radialTexture();

  constructor() {
    this.darkness.addChild(this.shade);
    // O filtro faz a escuridão ser desenhada à parte, para o "apagar" só afetar ela.
    this.darkness.filters = [new AlphaFilter()];
    this.overlay.addChild(this.darkness, this.glowLayer);
  }

  private sprite(pool: Sprite[], parent: Container, i: number, blend: 'erase' | 'add'): Sprite {
    let s = pool[i];
    if (!s) {
      s = new Sprite(this.tex);
      s.anchor.set(0.5);
      s.blendMode = blend;
      parent.addChild(s);
      pool[i] = s;
    }
    s.visible = true;
    return s;
  }

  update(dayFraction: number, camera: Camera, state: GameState, timeSec: number): void {
    const screenW = camera.screenW;
    const screenH = camera.screenH;
    const light = daylight(dayFraction);
    const night = 1 - light;
    // Intensidade do tom alaranjado: máxima nas transições.
    const warm = light > 0 && light < 1 ? Math.sin(light * Math.PI) : 0;
    const color = lerpColor(0x0b1235, 0xff8a3d, warm * (1 - night * 0.5));
    const alpha = night * 0.62 + warm * 0.12;
    this.shade.clear();
    this.overlay.visible = alpha > 0.01;
    if (!this.overlay.visible) return;
    this.shade.rect(0, 0, screenW, screenH).fill({ color, alpha });

    // Luzes: só quando escurece o bastante para fazer diferença.
    let n = 0;
    if (night > 0.15) {
      const ts = BALANCE.world.tileSize;
      const zoom = camera.zoom;
      const cx = camera.state.x;
      const cy = camera.state.y;
      for (const b of state.buildings) {
        const L = LIGHTS[b.kind];
        if (!L || !b.built) continue;
        const size = BUILDING_DEFS[b.kind].size;
        const wx = (b.tx + size / 2) * ts;
        const wy = (b.ty + size / 2) * ts;
        const sx = (wx - cx) * zoom + screenW / 2;
        const sy = (wy - cy) * zoom + screenH / 2;
        // Tremula um pouco, como chama.
        const flicker = 1 + Math.sin(timeSec * 7 + b.id) * 0.03 + Math.sin(timeSec * 13 + b.id * 3) * 0.02;
        const r = L.radius * ts * zoom * flicker;
        if (sx < -r || sy < -r || sx > screenW + r || sy > screenH + r) continue;
        const hole = this.sprite(this.holes, this.darkness, n, 'erase');
        hole.position.set(sx, sy);
        hole.width = hole.height = r * 2;
        hole.alpha = L.strength * Math.min(1, (night - 0.15) * 2);
        const glow = this.sprite(this.glows, this.glowLayer, n, 'add');
        glow.position.set(sx, sy);
        glow.width = glow.height = r * 1.6;
        glow.tint = 0xff9a40;
        glow.alpha = 0.22 * L.strength * night;
        n++;
      }
    }
    for (let i = n; i < this.holes.length; i++) {
      this.holes[i].visible = false;
      this.glows[i].visible = false;
    }
  }
}

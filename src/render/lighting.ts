import { Graphics } from 'pixi.js';
import { daylight } from '../core/time';
import { lerpColor } from './colors';

// Camada de iluminação em espaço de tela: escurece à noite e dá um tom quente no amanhecer e no anoitecer.
export class Lighting {
  readonly overlay = new Graphics();

  update(dayFraction: number, screenW: number, screenH: number): void {
    const light = daylight(dayFraction);
    const night = 1 - light;
    // Intensidade do tom alaranjado: máxima nas transições.
    const warm = light > 0 && light < 1 ? Math.sin(light * Math.PI) : 0;
    const color = lerpColor(0x0b1235, 0xff8a3d, warm * (1 - night * 0.5));
    const alpha = night * 0.62 + warm * 0.12;
    this.overlay.clear();
    if (alpha > 0.01) this.overlay.rect(0, 0, screenW, screenH).fill({ color, alpha });
  }
}

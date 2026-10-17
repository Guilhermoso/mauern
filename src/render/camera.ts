import { BALANCE } from '../data/balance';
import type { CameraState } from '../state';

// Câmera: (x, y) é o ponto do mundo no centro da tela.
export class Camera {
  constructor(
    public state: CameraState,
    public screenW: number,
    public screenH: number,
  ) {}

  get zoom(): number {
    return this.state.zoom;
  }

  worldW(): number {
    return BALANCE.world.width * BALANCE.world.tileSize;
  }

  worldH(): number {
    return BALANCE.world.height * BALANCE.world.tileSize;
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.state.x += dxScreen / this.state.zoom;
    this.state.y += dyScreen / this.state.zoom;
    this.clamp();
  }

  centerOn(x: number, y: number): void {
    this.state.x = x;
    this.state.y = y;
    this.clamp();
  }

  // Zoom mantendo fixo o ponto do mundo sob o cursor.
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    const { minZoom, maxZoom } = BALANCE.camera;
    this.state.zoom = Math.min(maxZoom, Math.max(minZoom, this.state.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.state.x += before.x - after.x;
    this.state.y += before.y - after.y;
    this.clamp();
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.state.x + (sx - this.screenW / 2) / this.state.zoom,
      y: this.state.y + (sy - this.screenH / 2) / this.state.zoom,
    };
  }

  // Retângulo visível em coordenadas de mundo.
  viewRect(): { x: number; y: number; w: number; h: number } {
    const w = this.screenW / this.state.zoom;
    const h = this.screenH / this.state.zoom;
    return { x: this.state.x - w / 2, y: this.state.y - h / 2, w, h };
  }

  clamp(): void {
    const margin = 200;
    this.state.x = Math.min(this.worldW() + margin, Math.max(-margin, this.state.x));
    this.state.y = Math.min(this.worldH() + margin, Math.max(-margin, this.state.y));
  }
}

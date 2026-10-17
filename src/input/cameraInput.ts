import { BALANCE } from '../data/balance';
import type { Camera } from '../render/camera';

// Controle de câmera estilo RTS: WASD/setas, mouse na borda da tela,
// arrastar com o botão do meio e zoom com a roda (no ponto do cursor).

export class CameraInput {
  private keys = new Set<string>();
  private mouse = { x: -1, y: -1, inside: false };
  private dragging: { x: number; y: number } | null = null;
  edgePan = true;

  constructor(private camera: Camera, canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY, inside: true };
      if (this.dragging) {
        this.camera.pan(this.dragging.x - e.clientX, this.dragging.y - e.clientY);
        this.dragging = { x: e.clientX, y: e.clientY };
      }
    });
    canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
    document.addEventListener('mouseleave', () => (this.mouse.inside = false));
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.dragging = { x: e.clientX, y: e.clientY };
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 1) this.dragging = null;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.camera.zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
      },
      { passive: false },
    );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update(dtSec: number): void {
    const c = BALANCE.camera;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (dx || dy) this.camera.pan(dx * c.keyPanSpeed * dtSec, dy * c.keyPanSpeed * dtSec);

    if (this.edgePan && this.mouse.inside && !this.dragging) {
      let ex = 0;
      let ey = 0;
      if (this.mouse.x <= c.edgePanMargin) ex = -1;
      else if (this.mouse.x >= this.camera.screenW - c.edgePanMargin) ex = 1;
      if (this.mouse.y <= c.edgePanMargin) ey = -1;
      else if (this.mouse.y >= this.camera.screenH - c.edgePanMargin) ey = 1;
      if (ex || ey) this.camera.pan(ex * c.edgePanSpeed * dtSec, ey * c.edgePanSpeed * dtSec);
    }
  }
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}

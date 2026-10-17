import type { UnitKind } from '../entities/types';

// Ícones das unidades, desenhados em canvas e guardados como imagem (data URL).
// Todos são um círculo azul (a cor do jogador) com o símbolo da unidade.

const cache = new Map<string, string>();
const SIZE = 64;

function base(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(SIZE * 0.4, SIZE * 0.35, 4, SIZE / 2, SIZE / 2, SIZE / 2);
  g.addColorStop(0, '#5f8fe8');
  g.addColorStop(1, '#2a56b8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1b3a7e';
  ctx.stroke();
}

function hammer(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#8b5e34';
  ctx.fillRect(-3, -6, 6, 26); // cabo
  ctx.fillStyle = '#c9ced3';
  ctx.fillRect(-12, -16, 24, 11); // cabeça
  ctx.fillStyle = '#9aa0a6';
  ctx.fillRect(-12, -9, 24, 4);
  ctx.restore();
}

function spear(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#8b5e34';
  ctx.fillRect(-2, -14, 4, 36); // haste
  ctx.fillStyle = '#e3e6ea';
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(7, -12);
  ctx.lineTo(-7, -12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7d848b';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function horse(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.fillStyle = '#e8dcc6';
  ctx.beginPath();
  // Cabeça de cavalo de perfil
  ctx.moveTo(-6, 18);
  ctx.lineTo(-10, 2);
  ctx.quadraticCurveTo(-8, -14, 4, -18);
  ctx.lineTo(8, -22);
  ctx.lineTo(9, -15);
  ctx.quadraticCurveTo(18, -6, 16, 2);
  ctx.lineTo(10, 4);
  ctx.quadraticCurveTo(4, 2, 2, 8);
  ctx.lineTo(4, 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a1d14';
  ctx.beginPath();
  ctx.arc(5, -8, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Lanceiro: lança longa e escudo redondo.
function spearAndShield(ctx: CanvasRenderingContext2D): void {
  spear(ctx);
  ctx.save();
  ctx.translate(SIZE / 2 - 8, SIZE / 2 + 8);
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#b5452e';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#e8c24a';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#e8c24a';
  ctx.fill();
  ctx.restore();
}

// Arqueiro: arco e flecha.
function bow(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(SIZE / 2, SIZE / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.beginPath();
  ctx.arc(-6, 0, 20, -Math.PI / 2.4, Math.PI / 2.4);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#8b5e34';
  ctx.stroke();
  const ex = -6 + Math.cos(Math.PI / 2.4) * 20;
  const ey = Math.sin(Math.PI / 2.4) * 20;
  ctx.beginPath();
  ctx.moveTo(ex, -ey);
  ctx.lineTo(ex, ey);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#e8e0c8';
  ctx.stroke();
  ctx.fillStyle = '#c9ced3';
  ctx.fillRect(-14, -1.5, 30, 3);
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(14, -5);
  ctx.lineTo(14, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const SYMBOLS: Record<UnitKind, (ctx: CanvasRenderingContext2D) => void> = {
  villager: hammer,
  militia: spear,
  scout: horse,
  spearman: spearAndShield,
  archer: bow,
};

export function unitIcon(kind: UnitKind): string {
  const hit = cache.get(kind);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  base(ctx);
  SYMBOLS[kind](ctx);
  const url = canvas.toDataURL('image/png');
  cache.set(kind, url);
  return url;
}

export function iconImg(kind: UnitKind, cls = 'icon'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.src = unitIcon(kind);
  img.alt = '';
  img.draggable = false;
  return img;
}

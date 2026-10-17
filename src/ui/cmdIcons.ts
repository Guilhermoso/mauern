// Ícones dos botões de comando, edifícios e recursos (estilo AoE3: pictograma sobre fundo escuro,
// a moldura vem do CSS). Desenhados em canvas uma vez e guardados como imagem.

type Ctx = CanvasRenderingContext2D;
const S = 64;
const cache = new Map<string, string>();

const WOOD = '#8b5e34';
const WOOD_DARK = '#5a3a1e';
const ROOF = '#b5452e';
const STONE = '#a9a49a';
const STEEL = '#c9ced3';
const GOLD = '#e8c24a';
const BLUE = '#3a6fd8';

function poly(ctx: Ctx, pts: number[], fill: string, stroke = '#1a120a', lw = 2): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, stroke = '#1a120a', lw = 2): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x, y, w, h);
  }
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string, stroke = '#1a120a', lw = 2): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function line(ctx: Ctx, pts: number[], color: string, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
}

// Casa vista de lado: parede e telhado.
function house(ctx: Ctx, x: number, y: number, w: number, h: number, roof = ROOF, wall = '#d8c49a'): void {
  rect(ctx, x, y + h * 0.42, w, h * 0.58, wall);
  poly(ctx, [x - 4, y + h * 0.45, x + w / 2, y, x + w + 4, y + h * 0.45], roof);
  rect(ctx, x + w * 0.4, y + h * 0.68, w * 0.2, h * 0.32, WOOD_DARK, '');
}

function axe(ctx: Ctx, cx: number, cy: number, s = 1): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.rotate(-0.6);
  rect(ctx, -2.5, -18, 5, 38, WOOD);
  poly(ctx, [2, -16, 16, -20, 18, -4, 2, -6], STEEL);
  ctx.restore();
}

function pickaxe(ctx: Ctx, cx: number, cy: number, s = 1): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.rotate(0.6);
  rect(ctx, -2.5, -14, 5, 34, WOOD);
  ctx.beginPath();
  ctx.moveTo(-20, -8);
  ctx.quadraticCurveTo(0, -24, 20, -8);
  ctx.quadraticCurveTo(0, -16, -20, -8);
  ctx.fillStyle = STEEL;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1a120a';
  ctx.stroke();
  ctx.restore();
}

function hammer(ctx: Ctx, cx: number, cy: number, s = 1): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.rotate(-0.7);
  rect(ctx, -2.5, -8, 5, 30, WOOD);
  rect(ctx, -12, -18, 24, 11, STEEL);
  ctx.restore();
}

function spear(ctx: Ctx, cx: number, cy: number, color = STEEL): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  rect(ctx, -2, -14, 4, 38, WOOD);
  poly(ctx, [0, -28, 7, -13, -7, -13], color);
  ctx.restore();
}

function flame(ctx: Ctx, cx: number, cy: number, s = 1): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.quadraticCurveTo(14, -4, 10, 8);
  ctx.quadraticCurveTo(6, 16, 0, 16);
  ctx.quadraticCurveTo(-6, 16, -10, 8);
  ctx.quadraticCurveTo(-14, -4, 0, -20);
  ctx.fillStyle = '#ff8a2a';
  ctx.fill();
  ctx.strokeStyle = '#7a2a0a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.quadraticCurveTo(7, 4, 4, 10);
  ctx.quadraticCurveTo(0, 14, -4, 10);
  ctx.quadraticCurveTo(-7, 4, 0, -6);
  ctx.fillStyle = '#ffe07a';
  ctx.fill();
  ctx.restore();
}

function cross(ctx: Ctx, cx: number, cy: number, r: number, color = '#d93a2b'): void {
  rect(ctx, cx - r / 3, cy - r, (r * 2) / 3, r * 2, color, '#fff', 2);
  rect(ctx, cx - r, cy - r / 3, r * 2, (r * 2) / 3, color, '', 0);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  const a = r / 3;
  ctx.moveTo(cx - a, cy - r);
  ctx.lineTo(cx + a, cy - r);
  ctx.lineTo(cx + a, cy - a);
  ctx.lineTo(cx + r, cy - a);
  ctx.lineTo(cx + r, cy + a);
  ctx.lineTo(cx + a, cy + a);
  ctx.lineTo(cx + a, cy + r);
  ctx.lineTo(cx - a, cy + r);
  ctx.lineTo(cx - a, cy + a);
  ctx.lineTo(cx - r, cy + a);
  ctx.lineTo(cx - r, cy - a);
  ctx.lineTo(cx - a, cy - a);
  ctx.closePath();
  ctx.stroke();
}

function shield(ctx: Ctx, cx: number, cy: number, fill = BLUE): void {
  poly(ctx, [cx - 16, cy - 18, cx + 16, cy - 18, cx + 16, cy - 2, cx, cy + 20, cx - 16, cy - 2], fill, '#1a120a', 2.5);
  poly(ctx, [cx - 2, cy - 18, cx + 2, cy - 18, cx + 2, cy + 16, cx - 2, cy + 16], GOLD, '', 0);
}

function arrowUp(ctx: Ctx, cx: number, cy: number, color = '#7fd88a'): void {
  poly(ctx, [cx, cy - 20, cx + 16, cy - 2, cx + 7, cy - 2, cx + 7, cy + 18, cx - 7, cy + 18, cx - 7, cy - 2, cx - 16, cy - 2], color);
}

function dots(ctx: Ctx, pts: [number, number][], lead: [number, number]): void {
  for (const [x, y] of pts) circle(ctx, x, y, 4.5, BLUE, '#0c1a3a', 1.5);
  circle(ctx, lead[0], lead[1], 5.5, GOLD, '#4a3410', 1.5);
}

const DRAW: Record<string, (ctx: Ctx) => void> = {
  // --- Edifícios ---
  townCenter: (c) => {
    rect(c, 12, 24, 40, 28, '#d8c49a');
    poly(c, [8, 26, 32, 8, 56, 26], ROOF);
    rect(c, 26, 36, 12, 16, WOOD_DARK, '');
    line(c, [32, 8, 32, 1], '#3a2e22', 2);
    poly(c, [32, 1, 42, 4, 32, 7], BLUE, '', 0);
  },
  house: (c) => house(c, 16, 14, 32, 38),
  lumberCamp: (c) => {
    poly(c, [8, 30, 32, 16, 56, 30], WOOD_DARK);
    rect(c, 12, 30, 40, 14, '#a07448');
    for (let i = 0; i < 3; i++) circle(c, 20 + i * 12, 50, 5, '#c08a50', '#3a2410', 1.5);
    axe(c, 46, 18, 0.55);
  },
  miningCamp: (c) => {
    poly(c, [8, 30, 32, 16, 56, 30], '#6b6b6b');
    rect(c, 12, 30, 40, 14, '#8a7a62');
    poly(c, [14, 56, 22, 46, 32, 50, 40, 44, 50, 56], STONE);
    pickaxe(c, 46, 18, 0.5);
  },
  mill: (c) => {
    rect(c, 22, 30, 20, 24, '#d8c49a');
    poly(c, [18, 32, 32, 20, 46, 32], ROOF);
    c.save();
    c.translate(32, 24);
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      rect(c, -2, -22, 4, 20, '#e8dcc6', '#3a2a1a', 1.5);
    }
    c.restore();
    circle(c, 32, 24, 3, WOOD_DARK, '', 0);
  },
  farm: (c) => {
    rect(c, 8, 12, 48, 40, '#7a5a2a');
    for (let i = 0; i < 5; i++) line(c, [12, 18 + i * 8, 52, 18 + i * 8], '#9bc24a', 3);
  },
  palisade: (c) => {
    for (let i = 0; i < 5; i++) poly(c, [8 + i * 10, 54, 8 + i * 10, 20, 12 + i * 10, 12, 16 + i * 10, 20, 16 + i * 10, 54], WOOD, '#2a1a0a', 1.5);
    line(c, [6, 30, 58, 30], WOOD_DARK, 3);
  },
  gate: (c) => {
    rect(c, 6, 18, 12, 38, WOOD);
    rect(c, 46, 18, 12, 38, WOOD);
    rect(c, 18, 26, 28, 30, '#6b4426');
    line(c, [32, 26, 32, 56], '#2a1a0a', 2);
    rect(c, 6, 14, 52, 8, WOOD_DARK);
  },
  watchTower: (c) => {
    poly(c, [20, 58, 24, 22, 40, 22, 44, 58], WOOD);
    line(c, [22, 40, 42, 40], WOOD_DARK, 2);
    rect(c, 16, 14, 32, 10, '#a07448');
    poly(c, [14, 16, 32, 4, 50, 16], ROOF);
  },
  well: (c) => {
    circle(c, 32, 40, 16, STONE, '#3a3530', 2.5);
    circle(c, 32, 40, 9, '#2a5aa8', '', 0);
    line(c, [18, 40, 18, 12, 46, 12, 46, 40], WOOD_DARK, 3);
    line(c, [32, 12, 32, 30], '#3a2a1a', 1.5);
  },
  bonfire: (c) => {
    line(c, [14, 54, 50, 42], WOOD, 6);
    line(c, [14, 42, 50, 54], WOOD, 6);
    flame(c, 32, 30, 1.1);
  },
  trainingGround: (c) => {
    rect(c, 8, 10, 48, 44, '#c8a86a', '#5a3a1e', 3);
    // boneco de treino
    line(c, [32, 20, 32, 48], WOOD_DARK, 4);
    line(c, [22, 28, 42, 28], WOOD_DARK, 4);
    circle(c, 32, 18, 6, '#d8c49a');
    spear(c, 44, 40);
  },
  refuge: (c) => {
    poly(c, [8, 34, 32, 12, 56, 34], '#6b8a4a');
    rect(c, 14, 34, 36, 20, '#a07448');
    poly(c, [26, 54, 26, 42, 38, 42, 38, 54], WOOD_DARK, '', 0);
  },
  hospital: (c) => {
    rect(c, 10, 22, 44, 32, '#e8dcc6');
    poly(c, [6, 24, 32, 8, 58, 24], ROOF);
    cross(c, 32, 38, 10);
  },

  // --- Ações ---
  stop: (c) => {
    // mão aberta
    rect(c, 18, 28, 28, 24, '#e8c39e', '#5a3a1e', 2);
    for (let i = 0; i < 4; i++) rect(c, 18 + i * 7, 10 + (i === 0 || i === 3 ? 6 : 0), 6, 22, '#e8c39e', '#5a3a1e', 1.5);
    poly(c, [46, 38, 56, 28, 58, 32, 48, 46], '#e8c39e', '#5a3a1e', 1.5);
  },
  delete: (c) => {
    line(c, [16, 16, 48, 48], '#d93a2b', 9);
    line(c, [48, 16, 16, 48], '#d93a2b', 9);
    line(c, [16, 16, 48, 48], '#ff8a7a', 3);
    line(c, [48, 16, 16, 48], '#ff8a7a', 3);
  },
  battalion: (c) => {
    line(c, [18, 8, 18, 58], '#3a2e22', 4);
    poly(c, [18, 10, 52, 18, 18, 30], GOLD, '#5a3d22', 2);
    dots(c, [[30, 46], [40, 46], [50, 46], [35, 55], [45, 55]], [24, 54]);
  },
  bell: (c) => {
    c.beginPath();
    c.moveTo(16, 46);
    c.quadraticCurveTo(18, 14, 32, 12);
    c.quadraticCurveTo(46, 14, 48, 46);
    c.closePath();
    c.fillStyle = '#d9a441';
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = '#4a3410';
    c.stroke();
    rect(c, 12, 46, 40, 5, '#b8862e', '#4a3410');
    circle(c, 32, 55, 4, '#4a3410', '', 0);
  },
  crown: (c) => {
    poly(c, [10, 46, 12, 18, 22, 32, 32, 12, 42, 32, 52, 18, 54, 46], GOLD, '#6a4a10', 2.5);
    rect(c, 10, 46, 44, 8, '#d9a441', '#6a4a10', 2);
    circle(c, 32, 38, 3.5, '#d93a2b', '', 0);
    circle(c, 20, 40, 3, BLUE, '', 0);
    circle(c, 44, 40, 3, BLUE, '', 0);
  },
  manual: (c) => {
    // cursor de comando
    poly(c, [20, 10, 20, 48, 30, 39, 37, 54, 43, 51, 36, 37, 48, 37], '#f2efe6', '#1a120a', 2.5);
  },
  defend: (c) => shield(c, 32, 32),
  hunt: (c) => {
    circle(c, 32, 32, 18, '', '#ff6b4a', 4);
    circle(c, 32, 32, 6, '#ff6b4a', '', 0);
    line(c, [32, 6, 32, 18], '#ff6b4a', 4);
    line(c, [32, 46, 32, 58], '#ff6b4a', 4);
    line(c, [6, 32, 18, 32], '#ff6b4a', 4);
    line(c, [46, 32, 58, 32], '#ff6b4a', 4);
  },
  autoHospital: (c) => {
    cross(c, 28, 34, 14);
    arrowUp(c, 50, 22, '#ffd45a');
  },
  upgrade: (c) => arrowUp(c, 32, 32),
  exit: (c) => {
    rect(c, 12, 10, 24, 44, WOOD_DARK);
    rect(c, 15, 13, 18, 38, '#1a1a1a', '', 0);
    poly(c, [30, 26, 44, 26, 44, 18, 58, 32, 44, 46, 44, 38, 30, 38], '#7fd88a');
  },
  work: (c) => {
    hammer(c, 26, 34);
    poly(c, [40, 38, 50, 28, 46, 28, 46, 18, 54, 18, 54, 28, 60, 28, 50, 38], '#7fd88a', '#1a120a', 1.5);
  },
  dismiss: (c) => {
    circle(c, 28, 22, 9, '#e8c39e');
    poly(c, [12, 56, 14, 36, 42, 36, 44, 56], BLUE);
    line(c, [42, 10, 58, 26], '#d93a2b', 5);
    line(c, [58, 10, 42, 26], '#d93a2b', 5);
  },
  tech: (c) => {
    // pergaminho
    rect(c, 14, 14, 36, 38, '#e8dcb0', '#6a5030', 2);
    circle(c, 14, 14, 5, '#d8c890', '#6a5030', 2);
    circle(c, 50, 52, 5, '#d8c890', '#6a5030', 2);
    for (let i = 0; i < 4; i++) line(c, [20, 24 + i * 7, 44, 24 + i * 7], '#8a7050', 2);
  },
  // Formações (vistas de cima, comandante dourado na frente/centro)
  'f-block': (c) => dots(c, [[22, 40], [32, 40], [42, 40], [22, 50], [32, 50], [42, 50]], [32, 22]),
  'f-line': (c) => dots(c, [[10, 40], [20, 40], [30, 40], [40, 40], [50, 40]], [32, 22]),
  'f-column': (c) => dots(c, [[32, 28], [32, 38], [32, 48], [32, 58]], [32, 14]),
  'f-wedge': (c) => dots(c, [[24, 28], [40, 28], [18, 40], [46, 40], [12, 52], [52, 52]], [32, 16]),
  'f-circle': (c) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 8; i++) pts.push([32 + Math.cos((i / 8) * Math.PI * 2) * 20, 32 + Math.sin((i / 8) * Math.PI * 2) * 20]);
    dots(c, pts, [32, 32]);
  },

  // --- Pesquisas ---
  sharpAxes: (c) => axe(c, 32, 34, 1.1),
  pickaxes: (c) => pickaxe(c, 32, 36, 1.1),
  woodenPlow: (c) => {
    line(c, [12, 44, 46, 20], WOOD, 5);
    poly(c, [40, 44, 54, 44, 50, 54, 36, 54], STEEL);
    line(c, [34, 30, 46, 46], WOOD_DARK, 4);
  },
  cropRotation: (c) => {
    for (let i = 0; i < 3; i++) {
      line(c, [20 + i * 12, 56, 20 + i * 12, 22], '#b8a040', 3);
      poly(c, [20 + i * 12, 10, 25 + i * 12, 18, 20 + i * 12, 30, 15 + i * 12, 18], '#e8c24a', '#7a6010', 1.5);
    }
  },
  wickerBaskets: (c) => {
    poly(c, [12, 26, 52, 26, 46, 54, 18, 54], '#c08a50', '#5a3a1e', 2);
    for (let i = 0; i < 3; i++) line(c, [16, 33 + i * 7, 48, 33 + i * 7], '#7a5028', 2);
    circle(c, 26, 22, 6, '#d93a4b', '#5a1a1a', 1.5);
    circle(c, 38, 22, 6, '#d93a4b', '#5a1a1a', 1.5);
  },
  preserves: (c) => {
    rect(c, 18, 20, 28, 34, '#d95a3a', '#4a1a10', 2);
    rect(c, 16, 12, 32, 9, '#e8dcb0', '#6a5030', 2);
    rect(c, 22, 30, 20, 12, '#e8dcb0', '', 0);
  },
  hearths: (c) => {
    rect(c, 10, 30, 44, 26, STONE, '#3a3530', 2);
    rect(c, 20, 38, 24, 18, '#2a1a10', '', 0);
    flame(c, 32, 40, 0.6);
  },
  buildingTools: (c) => {
    hammer(c, 26, 32);
    c.save();
    c.translate(42, 34);
    c.rotate(0.7);
    rect(c, -2.5, -18, 5, 36, WOOD);
    c.restore();
  },
  reinforcedPalisade: (c) => {
    for (let i = 0; i < 4; i++) poly(c, [10 + i * 11, 56, 10 + i * 11, 22, 15 + i * 11, 14, 20 + i * 11, 22, 20 + i * 11, 56], WOOD, '#2a1a0a', 1.5);
    rect(c, 6, 30, 50, 6, '#7d848b', '#2a2a2a', 1.5);
    rect(c, 6, 44, 50, 6, '#7d848b', '#2a2a2a', 1.5);
  },
  militiaDrill: (c) => {
    spear(c, 24, 34);
    spear(c, 40, 34);
  },
  fireArrows: (c) => {
    line(c, [12, 52, 46, 18], WOOD, 3);
    poly(c, [52, 12, 40, 18, 46, 24], STEEL);
    line(c, [12, 52, 18, 50], '#e8dcc6', 3);
    flame(c, 46, 22, 0.45);
  },
  sentinels: (c) => {
    c.beginPath();
    c.moveTo(8, 32);
    c.quadraticCurveTo(32, 8, 56, 32);
    c.quadraticCurveTo(32, 56, 8, 32);
    c.fillStyle = '#f2efe6';
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = '#1a120a';
    c.stroke();
    circle(c, 32, 32, 10, '#3a6f9a');
    circle(c, 32, 32, 4, '#0a0a0a', '', 0);
  },

  // --- Recursos ---
  'res-food': (c) => {
    // pernil
    c.save();
    c.translate(32, 32);
    c.rotate(-0.6);
    c.beginPath();
    c.ellipse(-4, 0, 16, 12, 0, 0, Math.PI * 2);
    c.fillStyle = '#c0503a';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#4a1a10';
    c.stroke();
    rect(c, 10, -3, 14, 6, '#f2e8d6', '#5a4a3a', 1.5);
    circle(c, 25, -4, 3.5, '#f2e8d6', '#5a4a3a', 1.5);
    circle(c, 25, 4, 3.5, '#f2e8d6', '#5a4a3a', 1.5);
    c.restore();
  },
  'res-wood': (c) => {
    for (const [x, y] of [[20, 42], [44, 42], [32, 24]] as [number, number][]) {
      circle(c, x, y, 11, '#a07448', '#3a2410', 2);
      circle(c, x, y, 5, '#d8b080', '', 0);
    }
  },
  'res-stone': (c) => {
    poly(c, [10, 50, 16, 30, 30, 22, 44, 26, 54, 44, 46, 54, 20, 56], STONE, '#3a3530', 2.5);
    line(c, [24, 34, 34, 44], '#6a655c', 2);
  },
  'res-iron': (c) => {
    poly(c, [10, 44, 20, 30, 54, 30, 44, 44], '#8a96a0', '#2a3036', 2);
    poly(c, [16, 54, 26, 40, 58, 40, 48, 54], '#6d7f8c', '#2a3036', 2);
  },
  'res-gold': (c) => {
    for (const [x, y] of [[24, 44], [40, 44], [32, 28]] as [number, number][]) {
      circle(c, x, y, 11, GOLD, '#6a4a10', 2);
      circle(c, x, y, 6, '', '#b8862e', 1.5);
    }
  },
  'res-pop': (c) => house(c, 14, 14, 36, 40, '#3a6fd8', '#d8c49a'),

  // --- Outros retratos ---
  titan: (c) => {
    circle(c, 32, 22, 12, '#d9a08a', '#5a2a1a', 2);
    poly(c, [16, 58, 18, 36, 46, 36, 48, 58], '#c98a72', '#5a2a1a', 2);
    circle(c, 28, 20, 2, '#1a0a0a', '', 0);
    circle(c, 36, 20, 2, '#1a0a0a', '', 0);
    line(c, [26, 27, 38, 27], '#5a1a1a', 2);
  },
  tree: (c) => {
    rect(c, 28, 40, 8, 18, WOOD);
    circle(c, 32, 28, 18, '#3f7a34', '#1a3a14', 2);
  },
  berries: (c) => {
    circle(c, 32, 34, 20, '#4f8a3a', '#1a3a14', 2);
    for (const [x, y] of [[24, 28], [38, 26], [30, 40], [42, 38], [22, 40]] as [number, number][]) circle(c, x, y, 4, '#d93a4b', '#5a1a1a', 1);
  },
  stone: (c) => DRAW['res-stone'](c),
  iron: (c) => {
    DRAW['res-stone'](c);
    circle(c, 26, 38, 4, '#b06a40', '', 0);
    circle(c, 40, 34, 3, '#b06a40', '', 0);
  },
  crystal: (c) => {
    poly(c, [32, 8, 42, 30, 32, 58, 22, 30], '#5fd3e6', '#1a5a6a', 2);
    poly(c, [14, 30, 22, 24, 26, 50, 18, 54], '#8ae6f2', '#1a5a6a', 1.5);
  },
};

export function hasCmdIcon(key: string): boolean {
  return key in DRAW;
}

export function cmdIconUrl(key: string): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  (DRAW[key] ?? DRAW.tech)(ctx);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function cmdIconImg(key: string, cls = 'cmd-icon'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.src = cmdIconUrl(key);
  img.alt = '';
  img.draggable = false;
  return img;
}

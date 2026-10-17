import { Container, Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import type { GameState } from '../state';
import type { Building, Unit } from '../entities/types';
import { BUILDING_DEFS } from '../entities/defs';
import { PLAYER_COLOR, shade } from './colors';

// Desenha edifícios e unidades. Cada entidade tem um Graphics próprio, criado uma vez
// e reposicionado a cada quadro.

export class EntityLayer {
  readonly container = new Container();
  private views = new Map<number, Graphics>();

  constructor() {
    this.container.sortableChildren = true;
  }

  sync(state: GameState, timeSec: number): void {
    const alive = new Set<number>();
    for (const b of state.buildings) {
      alive.add(b.id);
      let g = this.views.get(b.id);
      if (!g) {
        g = drawBuilding(b);
        this.views.set(b.id, g);
        this.container.addChild(g);
      }
      g.zIndex = (b.ty + BUILDING_DEFS[b.kind].size) * BALANCE.world.tileSize;
    }
    for (const u of state.units) {
      alive.add(u.id);
      let g = this.views.get(u.id);
      if (!g) {
        g = drawUnit(u);
        this.views.set(u.id, g);
        this.container.addChild(g);
      }
      // Pequena respiração para as unidades paradas não parecerem congeladas.
      const bob = Math.sin(timeSec * 2 + u.id) * 0.6;
      g.position.set(u.x, u.y + bob);
      if (u.kind === 'scout') g.rotation = u.facing;
      g.zIndex = u.y;
    }
    for (const [id, g] of this.views) {
      if (!alive.has(id)) {
        g.destroy();
        this.views.delete(id);
      }
    }
  }
}

function drawBuilding(b: Building): Graphics {
  const ts = BALANCE.world.tileSize;
  const size = BUILDING_DEFS[b.kind].size * ts;
  const g = new Graphics();
  g.position.set(b.tx * ts, b.ty * ts);
  if (b.kind === 'townCenter') {
    // Sombra
    g.rect(10, 12, size, size).fill({ color: 0x000000, alpha: 0.28 });
    // Base de pedra
    g.rect(0, 0, size, size).fill(0x9b9284);
    g.rect(4, 4, size - 8, size - 8).fill(0x8a8174);
    // Telhado em quatro águas visto de cima
    const m = 10;
    const roof = 0xa8432f;
    g.poly([m, m, size - m, m, size / 2, size / 2]).fill(shade(roof, 1.15));
    g.poly([size - m, m, size - m, size - m, size / 2, size / 2]).fill(shade(roof, 0.85));
    g.poly([size - m, size - m, m, size - m, size / 2, size / 2]).fill(shade(roof, 0.7));
    g.poly([m, size - m, m, m, size / 2, size / 2]).fill(roof);
    g.moveTo(m, m).lineTo(size - m, size - m).moveTo(size - m, m).lineTo(m, size - m).stroke({ width: 2, color: shade(roof, 0.55) });
    // Torre central com bandeira
    g.circle(size / 2, size / 2, 12).fill(0x7d7468);
    g.circle(size / 2, size / 2, 8).fill(0x6a6258);
    g.rect(size / 2 - 1, size / 2 - 22, 2, 22).fill(0x3a2e22);
    g.poly([size / 2 + 1, size / 2 - 22, size / 2 + 15, size / 2 - 18, size / 2 + 1, size / 2 - 14]).fill(PLAYER_COLOR);
    // Ameias nos cantos
    for (const [x, y] of [[0, 0], [size - 12, 0], [0, size - 12], [size - 12, size - 12]]) {
      g.rect(x, y, 12, 12).fill(0xb1a898);
      g.rect(x + 3, y + 3, 6, 6).fill(0x8a8174);
    }
  }
  return g;
}

function drawUnit(u: Unit): Graphics {
  const g = new Graphics();
  if (u.kind === 'villager') {
    g.ellipse(2, 5, 6, 3.5).fill({ color: 0x000000, alpha: 0.3 });
    g.circle(0, 0, 6).fill(0x7a5a3a); // roupa marrom
    g.circle(0, 0, 6).stroke({ width: 1.5, color: PLAYER_COLOR });
    g.circle(0, -1, 3.2).fill(0xe8c39e); // cabeça
  } else {
    g.ellipse(3, 6, 13, 6).fill({ color: 0x000000, alpha: 0.3 });
    g.ellipse(0, 0, 12, 5.5).fill(0x6b4426); // cavalo
    g.circle(11, -1, 3.5).fill(0x5a381e); // cabeça do cavalo
    g.circle(-1, 0, 5).fill(PLAYER_COLOR); // cavaleiro
    g.circle(-1, -0.5, 2.8).fill(0xe8c39e);
  }
  return g;
}

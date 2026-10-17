import { Container, Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import type { SelectionController } from '../input/selection';
import { canAfford, canPlace } from '../systems/commands';
import { titanRadius } from '../systems/damage';
import { serviceRadius } from '../systems/city';
import { drawBuildingArt } from './buildingArt';

// Marcadores de interface no mundo: seleção, barras de vida, progresso de construção,
// ponto de reunião, prévia do edifício a construir e marcas de comando.
export class OverlayLayer {
  readonly under = new Graphics(); // abaixo das entidades
  readonly over = new Container(); // acima das entidades
  private g = new Graphics();
  private ghost: { kind: string; root: Container } | null = null;
  readonly screen = new Graphics(); // caixa de seleção (em coordenadas de tela)

  constructor() {
    this.over.addChild(this.g);
  }

  update(sim: Sim, sel: SelectionController, zoom: number): void {
    const ts = BALANCE.world.tileSize;
    const under = this.under;
    const g = this.g;
    under.clear();
    g.clear();
    const line = 1.5 / Math.max(zoom, 0.5);
    const s = sel.selection;
    const pt0 = () => sel.placementTile();

    for (const id of s.units) {
      const u = sim.unit(id);
      if (!u) continue;
      const r = UNIT_DEFS[u.kind].radius;
      under.ellipse(u.x, u.y + 3, r + 4, (r + 4) * 0.6).stroke({ width: line, color: 0x7cff6b });
      if (s.units.length <= 30) bar(g, u.x - 9, u.y - r - 10, 18, u.hp / UNIT_DEFS[u.kind].maxHp, 0x5bd34a);
    }

    for (const b of sim.state.buildings) {
      const def = BUILDING_DEFS[b.kind];
      const size = def.size * ts;
      const x = b.tx * ts;
      const y = b.ty * ts;
      const selected = s.building === b.id;
      if (selected) {
        corners(g, x - 3, y - 3, size + 6, size + 6, 10, line * 1.3, 0x7cff6b);
        bar(g, x + size / 2 - 24, y - 12, 48, b.hp / def.maxHp, 0x5bd34a);
        if (b.rally) {
          const rx = (b.rally.tx + 0.5) * ts;
          const ry = (b.rally.ty + 0.5) * ts;
          g.moveTo(x + size / 2, y + size / 2).lineTo(rx, ry).stroke({ width: line, color: 0xffffff, alpha: 0.45 });
          g.rect(rx - 1, ry - 18, 2, 18).fill(0x3a2e22);
          g.poly([rx + 1, ry - 18, rx + 13, ry - 14, rx + 1, ry - 10]).fill(0x4f8cff);
        }
      }
      if (!b.built) bar(g, x + size / 2 - 24, y + size / 2 - 3, 48, b.progress / def.buildTime, 0xe0b43c);
    }

    // Alcance de poços e fogueiras: aparece ao posicionar casas/poços/fogueiras ou com uma casa selecionada.
    const selB = s.building !== null ? sim.building(s.building) : undefined;
    const showCoverage =
      sel.placing === 'house' || sel.placing === 'well' || sel.placing === 'bonfire' || selB?.kind === 'house' || selB?.kind === 'well' || selB?.kind === 'bonfire';
    if (showCoverage) {
      for (const b of sim.state.buildings) {
        if (b.kind !== 'well' && b.kind !== 'bonfire') continue;
        const size = BUILDING_DEFS[b.kind].size;
        const color = b.kind === 'well' ? 0x4fa3ff : 0xff9a3c;
        under.circle((b.tx + size / 2) * ts, (b.ty + size / 2) * ts, serviceRadius(sim, b.kind) * ts).fill({ color, alpha: 0.07 }).stroke({ width: line, color, alpha: 0.6 });
      }
      if ((sel.placing === 'well' || sel.placing === 'bonfire') && pt0()) {
        const p = pt0()!;
        const size = BUILDING_DEFS[sel.placing].size;
        const color = sel.placing === 'well' ? 0x4fa3ff : 0xff9a3c;
        under.circle((p.tx + size / 2) * ts, (p.ty + size / 2) * ts, serviceRadius(sim, sel.placing) * ts).stroke({ width: line * 1.5, color });
      }
    }

    // Titãs: barra de vida quando feridos ou selecionados.
    for (const t of sim.state.titans) {
      const r = titanRadius(t.height);
      const selected = s.titan === t.id;
      if (selected) under.ellipse(t.x, t.y + 4, r + 8, (r + 8) * 0.7).stroke({ width: line * 1.4, color: 0xff4a3a });
      if (selected || t.hp < t.maxHp) bar(g, t.x - r, t.y - r - 12, r * 2, t.hp / t.maxHp, 0xd94a3a);
    }

    if (s.node !== null) {
      const n = sim.node(s.node);
      if (n) under.circle((n.tx + 0.5) * ts, (n.ty + 0.5) * ts, 18).stroke({ width: line, color: 0xffd34d });
    }

    // Prévia do edifício a construir.
    const pt = sel.placementTile();
    const wall = sel.placing ? BUILDING_DEFS[sel.placing].wall : false;
    if (sel.placing && pt && wall) {
      // Linha de muralha: cada segmento verde (pode) ou vermelho (não pode).
      if (this.ghost) this.ghost.root.visible = false;
      const cost = BUILDING_DEFS[sel.placing].cost;
      let budget = Math.floor(sim.state.resources.wood / (cost.wood ?? 1));
      for (const t of sel.wallPreview()) {
        const blocked = canPlace(sim, sel.placing, t.tx, t.ty);
        const existing = blocked && sim.buildingAt(t.tx, t.ty)?.kind === sel.placing;
        const ok = !blocked && budget > 0;
        if (ok) budget--;
        const color = existing ? 0x999999 : ok ? 0x5bd34a : 0xe0443a;
        g.rect(t.tx * ts + 3, t.ty * ts + 3, ts - 6, ts - 6).fill({ color, alpha: 0.35 }).stroke({ width: line, color });
      }
    } else if (sel.placing && pt) {
      if (!this.ghost || this.ghost.kind !== sel.placing) {
        this.ghost?.root.destroy({ children: true });
        const art = drawBuildingArt(sel.placing, true, 1);
        art.root.alpha = 0.6;
        this.ghost = { kind: sel.placing, root: art.root };
        this.over.addChildAt(art.root, 0);
      }
      const size = BUILDING_DEFS[sel.placing].size * ts;
      this.ghost.root.position.set(pt.tx * ts, pt.ty * ts);
      this.ghost.root.visible = true;
      const ok = !canPlace(sim, sel.placing, pt.tx, pt.ty) && canAfford(sim, BUILDING_DEFS[sel.placing].cost);
      this.ghost.root.alpha = BUILDING_DEFS[sel.placing].gate ? 0.9 : 0.6;
      const color = ok ? 0x5bd34a : 0xe0443a;
      g.rect(pt.tx * ts, pt.ty * ts, size, size).fill({ color, alpha: 0.25 }).stroke({ width: line * 1.5, color });
    } else if (this.ghost) {
      this.ghost.root.visible = false;
    }

    // Marcas de comando (círculo que encolhe e some).
    const now = performance.now();
    sel.markers = sel.markers.filter((m) => now - m.time < 500);
    for (const m of sel.markers) {
      const t = (now - m.time) / 500;
      under.ellipse(m.x, m.y, 14 * (1 - t) + 3, (14 * (1 - t) + 3) * 0.6).stroke({ width: line * 1.4, color: m.color, alpha: 1 - t });
    }

    const screen = this.screen;
    screen.clear();
    const rect = sel.dragRect();
    if (rect) screen.rect(rect.x, rect.y, rect.w, rect.h).fill({ color: 0x7cff6b, alpha: 0.08 }).stroke({ width: 1, color: 0x7cff6b });
  }
}

function bar(g: Graphics, x: number, y: number, w: number, frac: number, color: number): void {
  const f = Math.max(0, Math.min(1, frac));
  g.rect(x - 1, y - 1, w + 2, 6).fill({ color: 0x000000, alpha: 0.6 });
  g.rect(x, y, w * f, 4).fill(f < 0.35 && color === 0x5bd34a ? 0xe0443a : color);
}

function corners(g: Graphics, x: number, y: number, w: number, h: number, len: number, width: number, color: number): void {
  g.moveTo(x, y + len).lineTo(x, y).lineTo(x + len, y);
  g.moveTo(x + w - len, y).lineTo(x + w, y).lineTo(x + w, y + len);
  g.moveTo(x + w, y + h - len).lineTo(x + w, y + h).lineTo(x + w - len, y + h);
  g.moveTo(x + len, y + h).lineTo(x, y + h).lineTo(x, y + h - len);
  g.stroke({ width, color });
}

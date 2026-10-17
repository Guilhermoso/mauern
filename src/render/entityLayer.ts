import { Container, Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { GameState } from '../state';
import type { Building, ResourceKind, Unit } from '../entities/types';
import { PLAYER_COLOR } from './colors';
import { drawBuildingArt, type BuildingArt } from './buildingArt';

// Desenha edifícios e unidades. Cada entidade tem uma view criada uma vez e atualizada a cada quadro;
// edifícios são redesenhados quando o estado visual muda (ex.: progresso da construção).

const CARRY_COLORS: Record<ResourceKind, number> = {
  food: 0xd2553f,
  wood: 0x9a6a3a,
  stone: 0xb0aca2,
  iron: 0x6d7f8c,
  gold: 0xe0b43c,
};

interface BuildingView {
  art: BuildingArt;
  key: string;
}

interface UnitView {
  root: Container;
  body: Graphics;
  carry: Graphics;
  tool: Graphics;
  carryKey: string;
}

export class EntityLayer {
  readonly container = new Container();
  private buildings = new Map<number, BuildingView>();
  private units = new Map<number, UnitView>();

  constructor() {
    this.container.sortableChildren = true;
  }

  sync(state: GameState, timeSec: number): void {
    const ts = BALANCE.world.tileSize;
    const aliveB = new Set<number>();
    for (const b of state.buildings) {
      aliveB.add(b.id);
      const def = BUILDING_DEFS[b.kind];
      const p = b.built ? 1 : b.progress / def.buildTime;
      const key = `${b.built}|${Math.floor(p * 10)}`;
      let v = this.buildings.get(b.id);
      if (!v || v.key !== key) {
        if (v) v.art.root.destroy({ children: true });
        v = { art: drawBuildingArt(b.kind, b.built, p), key };
        v.art.root.position.set(b.tx * ts, b.ty * ts);
        this.buildings.set(b.id, v);
        this.container.addChild(v.art.root);
      }
      // Fazendas ficam sempre por baixo das unidades.
      v.art.root.zIndex = b.kind === 'farm' ? -1e6 + b.ty : (b.ty + def.size) * ts;
      if (v.art.blades) v.art.blades.rotation = timeSec * 0.6 + b.id;
    }
    for (const [id, v] of this.buildings) {
      if (!aliveB.has(id)) {
        v.art.root.destroy({ children: true });
        this.buildings.delete(id);
      }
    }

    const aliveU = new Set<number>();
    for (const u of state.units) {
      aliveU.add(u.id);
      let v = this.units.get(u.id);
      if (!v) {
        v = createUnitView(u);
        this.units.set(u.id, v);
        this.container.addChild(v.root);
      }
      updateUnitView(v, u, timeSec);
    }
    for (const [id, v] of this.units) {
      if (!aliveU.has(id)) {
        v.root.destroy({ children: true });
        this.units.delete(id);
      }
    }
  }
}

function createUnitView(u: Unit): UnitView {
  const root = new Container();
  const body = new Graphics();
  const carry = new Graphics();
  const tool = new Graphics();
  if (u.kind === 'villager') {
    body.ellipse(2, 5, 6, 3.5).fill({ color: 0x000000, alpha: 0.3 });
    body.circle(0, 0, 6).fill(0x7a5a3a);
    body.circle(0, 0, 6).stroke({ width: 1.5, color: PLAYER_COLOR });
    body.circle(0, -1, 3.2).fill(0xe8c39e);
    // Ferramenta (aparece ao trabalhar)
    tool.rect(0, -1, 9, 2).fill(0x6b4a2a);
    tool.rect(7, -3, 3, 6).fill(0x9aa0a6);
    tool.visible = false;
  } else {
    body.ellipse(3, 6, 13, 6).fill({ color: 0x000000, alpha: 0.3 });
    body.ellipse(0, 0, 12, 5.5).fill(0x6b4426);
    body.circle(11, -1, 3.5).fill(0x5a381e);
    body.circle(-1, 0, 5).fill(PLAYER_COLOR);
    body.circle(-1, -0.5, 2.8).fill(0xe8c39e);
  }
  root.addChild(tool, body, carry);
  return { root, body, carry, tool, carryKey: '' };
}

function updateUnitView(v: UnitView, u: Unit, timeSec: number): void {
  const working = !u.moving && (u.order.type === 'gather' || u.order.type === 'build' || u.order.type === 'farm');
  // Andando: balança mais; parado: respiração leve.
  const bob = u.moving ? Math.abs(Math.sin(timeSec * 12 + u.id)) * -1.5 : Math.sin(timeSec * 2 + u.id) * 0.6;
  v.root.position.set(u.x, u.y + bob);
  v.root.zIndex = u.y;
  if (u.kind === 'scout') {
    v.body.rotation = u.facing;
    return;
  }
  v.tool.visible = working;
  if (working) {
    v.tool.rotation = u.facing + Math.sin(timeSec * 9 + u.id) * 0.7;
  }
  const key = u.carry ? `${u.carry.kind}|${Math.min(3, Math.ceil(u.carry.amount / 3))}` : '';
  if (key !== v.carryKey) {
    v.carryKey = key;
    v.carry.clear();
    if (u.carry) {
      const n = Math.min(3, Math.ceil(u.carry.amount / 3));
      for (let i = 0; i < n; i++) v.carry.rect(3, 1 - i * 3, 6, 3).fill(CARRY_COLORS[u.carry.kind]).stroke({ width: 0.5, color: 0x000000, alpha: 0.4 });
    }
  }
}

export function buildingCenterPx(b: Building): { x: number; y: number } {
  const ts = BALANCE.world.tileSize;
  const s = BUILDING_DEFS[b.kind].size * ts;
  return { x: b.tx * ts + s / 2, y: b.ty * ts + s / 2 };
}

import { Container, Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import type { Building, ResourceKind, Unit } from '../entities/types';
import { PLAYER_COLOR } from './colors';
import { drawBuildingArt, NEIGHBOR_DIRS, type BuildingArt } from './buildingArt';
import { createTitanView, updateTitanView, type TitanView } from './titanArt';

// Desenha edifícios, unidades e titãs. Cada entidade tem uma view criada uma vez e atualizada a cada quadro;
// edifícios são redesenhados quando o estado visual muda (progresso da construção, vizinhos da muralha).

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
  badge: Graphics;
  carryKey: string;
  badgeKey: string;
}

// Cor da insígnia por grupo de patentes: praças, sargentos, oficiais, oficiais superiores, generais.
const BADGE_COLORS = [0xb07a45, 0xc0c4c8, 0xe8c24a, 0x6fc3e8, 0xe0504a];

export class EntityLayer {
  readonly container = new Container();
  private buildings = new Map<number, BuildingView>();
  private units = new Map<number, UnitView>();
  private titans = new Map<number, TitanView>();

  constructor() {
    this.container.sortableChildren = true;
  }

  sync(sim: Sim, timeSec: number): void {
    const state = sim.state;
    const ts = BALANCE.world.tileSize;
    const aliveB = new Set<number>();
    for (const b of state.buildings) {
      aliveB.add(b.id);
      const def = BUILDING_DEFS[b.kind];
      const p = b.built ? 1 : b.progress / def.buildTime;
      const mask = def.wall || def.gate ? wallMask(sim, b) : 0;
      const key = `${b.built}|${Math.floor(p * 10)}|${mask}|${b.level}`;
      let v = this.buildings.get(b.id);
      if (!v || v.key !== key) {
        if (v) v.art.root.destroy({ children: true });
        v = { art: drawBuildingArt(b.kind, b.built, p, mask, b.level), key };
        v.art.root.position.set(b.tx * ts, b.ty * ts);
        this.buildings.set(b.id, v);
        this.container.addChild(v.art.root);
      }
      // Edifícios que se pode atravessar (fazenda, campo de treinamento) ficam sempre por baixo das unidades.
      v.art.root.zIndex = def.walkable ? -1e6 + b.ty : (b.ty + def.size) * ts;
      if (v.art.blades) v.art.blades.rotation = timeSec * 0.6 + b.id;
      if (v.art.flame) {
        // Chama que tremula.
        const f = 1 + Math.sin(timeSec * 13 + b.id) * 0.08 + Math.sin(timeSec * 7.3) * 0.06;
        v.art.flame.scale.set(f, f * 1.05);
        v.art.flame.alpha = 0.85 + Math.sin(timeSec * 17) * 0.1;
      }
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
      const commander = u.battalion ? state.battalions.find((b) => b.id === u.battalion)?.commanderId === u.id : false;
      updateUnitView(v, u, timeSec, commander);
    }
    for (const [id, v] of this.units) {
      if (!aliveU.has(id)) {
        v.root.destroy({ children: true });
        this.units.delete(id);
      }
    }

    const aliveT = new Set<number>();
    for (const t of state.titans) {
      aliveT.add(t.id);
      let v = this.titans.get(t.id);
      if (!v) {
        v = createTitanView(t);
        this.titans.set(t.id, v);
        this.container.addChild(v.root);
      }
      updateTitanView(v, t, state.tick, BALANCE.titans.attackCooldown);
    }
    for (const [id, v] of this.titans) {
      if (!aliveT.has(id)) {
        v.root.destroy({ children: true });
        this.titans.delete(id);
      }
    }
  }
}

function wallMask(sim: Sim, b: Building): number {
  let mask = 0;
  NEIGHBOR_DIRS.forEach(([dx, dy], i) => {
    const n = sim.buildingAt(b.tx + dx, b.ty + dy);
    if (n && (BUILDING_DEFS[n.kind].wall || BUILDING_DEFS[n.kind].gate)) mask |= 1 << i;
  });
  return mask;
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
  } else if (u.kind === 'militia') {
    body.ellipse(2, 5, 7, 4).fill({ color: 0x000000, alpha: 0.3 });
    body.circle(0, 0, 7).fill(PLAYER_COLOR);
    body.circle(0, 0, 7).stroke({ width: 1.2, color: 0x1d3a78 });
    body.circle(0, -1, 3.8).fill(0x9aa0a6); // elmo
    body.circle(-0.8, -1.8, 1.4).fill(0xc9ced3);
    // Lança
    tool.rect(-4, -1, 18, 1.6).fill(0x6b4a2a);
    tool.poly([14, -3, 19, 0, 14, 3]).fill(0xc9ced3);
  } else {
    body.ellipse(3, 6, 13, 6).fill({ color: 0x000000, alpha: 0.3 });
    body.ellipse(0, 0, 12, 5.5).fill(0x6b4426);
    body.circle(11, -1, 3.5).fill(0x5a381e);
    body.circle(-1, 0, 5).fill(PLAYER_COLOR);
    body.circle(-1, -0.5, 2.8).fill(0xe8c39e);
  }
  const badge = new Graphics();
  root.addChild(tool, body, carry, badge);
  return { root, body, carry, tool, badge, carryKey: '', badgeKey: '' };
}

// Insígnia: um ponto colorido pelo grupo de patentes, com 1 a 5 traços conforme o grau;
// o comandante de batalhão leva um estandarte.
function drawBadge(g: Graphics, u: Unit, commander: boolean): void {
  g.clear();
  if (u.kind === 'villager') {
    // Aldeão aterrorizado: um "!" vermelho sobre a cabeça.
    if (u.terror > 0) {
      g.circle(0, -14, 4.5).fill(0xd93a2b).stroke({ width: 1, color: 0xffffff });
      g.rect(-0.8, -17, 1.6, 4).fill(0xffffff);
      g.rect(-0.8, -12, 1.6, 1.4).fill(0xffffff);
    }
    return;
  }
  const tier = Math.min(4, Math.floor((u.level - 1) / 20));
  const grade = ((u.level - 1) % 5) + 1;
  g.circle(-7, -9, 3).fill(BADGE_COLORS[tier]).stroke({ width: 0.8, color: 0x000000, alpha: 0.6 });
  for (let i = 0; i < grade; i++) g.rect(-3 + i * 2.2, -10.5, 1.4, 3).fill(BADGE_COLORS[tier]);
  if (commander) {
    g.rect(5, -20, 1.5, 16).fill(0x3a2e22);
    g.poly([6.5, -20, 16, -17, 6.5, -14]).fill(0xd9a441).stroke({ width: 0.6, color: 0x5a3d22 });
  }
}

function updateUnitView(v: UnitView, u: Unit, timeSec: number, commander = false): void {
  v.root.visible = !u.garrison;
  if (u.garrison) return;
  const badgeKey = `${u.level}|${commander}|${u.terror > 0}`;
  if (badgeKey !== v.badgeKey) {
    v.badgeKey = badgeKey;
    drawBadge(v.badge, u, commander);
  }
  const training = u.order.type === 'train' && !u.moving;
  const working = !u.moving && (u.order.type === 'gather' || u.order.type === 'build' || u.order.type === 'farm' || u.order.type === 'attack' || training);
  // Andando: balança mais; parado: respiração leve.
  const bob = u.moving ? Math.abs(Math.sin(timeSec * 12 + u.id)) * -1.5 : Math.sin(timeSec * 2 + u.id) * 0.6;
  v.root.position.set(u.x, u.y + bob);
  v.root.zIndex = u.y;
  if (u.kind === 'scout') {
    v.body.rotation = u.facing;
    return;
  }
  if (u.kind === 'militia') {
    // A lança aponta para a frente e estoca durante o combate.
    const thrust = working ? Math.max(0, Math.sin(timeSec * 8 + u.id)) * 5 : 0;
    v.tool.rotation = u.facing;
    v.tool.position.set(Math.cos(u.facing) * thrust, Math.sin(u.facing) * thrust);
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

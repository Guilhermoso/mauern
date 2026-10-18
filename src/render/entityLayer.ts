import { AlphaFilter, Container, Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import type { Building, ResourceKind, Unit } from '../entities/types';
import { PLAYER_COLOR } from './colors';
import { daylight, getClock } from '../core/time';
import { isVisible } from '../systems/fog';
import { drawPoi } from './poiArt';
import { isGateOpen } from '../systems/gates';
import { drawBuildingArt, NEIGHBOR_DIRS, type BuildingArt, type Caster } from './buildingArt';
import { createTitanView, updateTitanView, type TitanView } from './titanArt';

// Desenha edifícios, unidades e titãs. Cada entidade tem uma view criada uma vez e atualizada a cada quadro;
// edifícios são redesenhados quando o estado visual muda (progresso da construção, vizinhos da muralha).

const CARRY_COLORS: Record<ResourceKind, number> = {
  food: 0xd2553f,
  wood: 0x9a6a3a,
  stone: 0xb0aca2,
  iron: 0x6d7f8c,
  gold: 0xe0b43c,
  wool: 0xeeeae0,
  bread: 0xc8904a,
  clothes: 0x6a5aa8,
};

interface BuildingView {
  art: BuildingArt;
  key: string;
  shadow: Graphics | null; // sombra no chão (na camada de sombras)
  shadowKey: string;
}

interface UnitView {
  root: Container;
  body: Graphics;
  carry: Graphics;
  tool: Graphics;
  badge: Graphics;
  mount: Graphics; // cavalo do nobre (só visual)
  glow: Graphics; // aura dourada da lenda
  shield: Graphics; // anel do escudo
  noble: boolean;
  carryKey: string;
  badgeKey: string;
}

// Cor da insígnia por grupo de patentes: praças, sargentos, oficiais, oficiais superiores, generais.
const BADGE_COLORS = [0xb07a45, 0xc0c4c8, 0xe8c24a, 0x6fc3e8, 0xe0504a];

export class EntityLayer {
  readonly container = new Container();
  // Edifícios que se pode atravessar (fazendas, campos de treinamento, refúgio...): ficam no chão,
  // abaixo das sombras e dos anéis de seleção das unidades que estão em cima deles.
  readonly ground = new Container();
  // Sombras dos edifícios: desenhadas opacas e com transparência aplicada à camada inteira, para que
  // sombras sobrepostas não escureçam em dobro. Fica abaixo de todos os edifícios e unidades.
  readonly shadows = new Container();
  private shadowAlpha = new AlphaFilter({ alpha: 0.3 });
  private buildings = new Map<number, BuildingView>();
  private units = new Map<number, UnitView>();
  private titans = new Map<number, TitanView>();
  private pois = new Map<number, { g: Graphics; key: string }>();

  constructor() {
    this.container.sortableChildren = true;
    this.shadows.filters = [this.shadowAlpha];
  }

  sync(sim: Sim, timeSec: number): void {
    const state = sim.state;
    const ts = BALANCE.world.tileSize;
    const aliveB = new Set<number>();
    const sun = sunShadow(state.tick);
    this.shadowAlpha.alpha = sun.alpha;
    this.shadows.visible = sun.alpha > 0.01;
    const sunKey = `${Math.round(sun.dx)},${Math.round(sun.dy)}`;
    for (const b of state.buildings) {
      aliveB.add(b.id);
      const def = BUILDING_DEFS[b.kind];
      const p = b.built ? 1 : b.progress / def.buildTime;
      const mask = def.wall || def.gate ? wallMask(sim, b) : 0;
      const open = def.gate ? isGateOpen(sim, b) : false;
      const key = `${b.built}|${Math.floor(p * 10)}|${mask}|${b.level}|${open}|${b.ruined}`;
      let v = this.buildings.get(b.id);
      if (!v || v.key !== key) {
        if (v) {
          v.art.root.destroy({ children: true });
          v.shadow?.destroy();
        }
        const art = drawBuildingArt(b.kind, b.built, p, mask, b.level, open, b.ruined);
        let shadow: Graphics | null = null;
        if (art.casters?.length) {
          shadow = new Graphics();
          shadow.position.set(b.tx * ts, b.ty * ts);
          this.shadows.addChild(shadow);
        }
        v = { art, key, shadow, shadowKey: '' };
        v.art.root.position.set(b.tx * ts, b.ty * ts);
        this.buildings.set(b.id, v);
        (def.walkable ? this.ground : this.container).addChild(v.art.root);
      }
      // Edifícios que se pode atravessar (fazenda, campo de treinamento) ficam sempre por baixo das unidades.
      v.art.root.zIndex = def.walkable ? -1e6 + b.ty : (b.ty + def.size) * ts;
      if (v.shadow && this.shadows.visible && v.shadowKey !== sunKey) {
        v.shadowKey = sunKey;
        drawShadow(v.shadow, v.art.casters!, sun.dx, sun.dy);
      }
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
        v.shadow?.destroy();
        this.buildings.delete(id);
      }
    }

    const aliveU = new Set<number>();
    for (const u of state.units) {
      aliveU.add(u.id);
      let v = this.units.get(u.id);
      if (v && v.noble !== u.noble) {
        // Recebeu o título: troca o desenho (cavalo e lança dourada).
        v.root.destroy({ children: true });
        this.units.delete(u.id);
        v = undefined;
      }
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
      // Fora da visão (névoa de guerra), o titã não aparece.
      v.root.visible = sim.fogVersion === 0 || isVisible(sim, t.x, t.y);
    }
    for (const [id, v] of this.titans) {
      if (!aliveT.has(id)) {
        v.root.destroy({ children: true });
        this.titans.delete(id);
      }
    }

    // Pontos de interesse já descobertos (no chão, abaixo das unidades).
    for (const p of state.pois) {
      if (!p.discovered) continue;
      const key = `${p.kind}|${p.done}`;
      let v = this.pois.get(p.id);
      if (!v || v.key !== key) {
        v?.g.destroy();
        v = { g: drawPoi(p.kind, p.done), key };
        v.g.position.set((p.tx + 0.5) * ts, (p.ty + 0.5) * ts);
        this.ground.addChild(v.g);
        this.pois.set(p.id, v);
      }
    }
  }
}

// Deslocamento da sombra (em px, para um edifício de altura 8) conforme a posição do sol:
// de manhã o sol nasce a leste e a sombra se estende para oeste; ao meio-dia ela é curta;
// à tarde vai para leste. À noite quase some.
function sunShadow(tick: number): { dx: number; dy: number; alpha: number } {
  const c = getClock(tick);
  const hour = c.dayFraction * 24;
  const { dawnHour, duskHour } = BALANCE.time;
  const t = Math.min(1, Math.max(0, (hour - dawnHour) / (duskHour - dawnHour))); // 0 = nascer, 1 = pôr do sol
  const angle = t * Math.PI; // 0 = leste, π = oeste
  const elevation = Math.sin(angle); // 0 no horizonte, 1 ao meio-dia
  const len = 6 + 24 * Math.abs(Math.cos(angle)); // sombra longa com o sol baixo, curta ao meio-dia
  const light = daylight(c.dayFraction);
  return {
    dx: -Math.cos(angle) * len,
    dy: 4 + 3 * (1 - elevation), // o sol passa um pouco ao sul: a sombra pende para o norte… e para baixo na tela
    // Some no escuro: assim a sombra não "pula" de leste para oeste durante a noite.
    alpha: 0.34 * light * (0.6 + 0.4 * elevation),
  };
}

// Sombra projetada: o contorno que envolve a forma do edifício e a mesma forma deslocada pelo sol
// (proporcional à altura). Assim ela sai das paredes, como uma sombra de verdade.
function drawShadow(g: Graphics, casters: Caster[], dx: number, dy: number): void {
  g.clear();
  for (const c of casters) {
    const k = c.h / 8;
    const pts: [number, number][] = [];
    for (let i = 0; i < c.pts.length; i += 2) {
      pts.push([c.pts[i], c.pts[i + 1]]);
      pts.push([c.pts[i] + dx * k, c.pts[i + 1] + dy * k]);
    }
    g.poly(convexHull(pts).flat()).fill(0x000000);
  }
}

// Envoltória convexa (cadeia monótona).
function convexHull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function wallMask(sim: Sim, b: Building): number {
  let mask = 0;
  NEIGHBOR_DIRS.forEach(([dx, dy], i) => {
    const n = sim.buildingAt(b.tx + dx, b.ty + dy);
    if (n && (BUILDING_DEFS[n.kind].wall || BUILDING_DEFS[n.kind].gate)) mask |= 1 << i;
  });
  return mask;
}

// Soldados a pé (podem receber título e montar a cavalo, e mostram escudo e aura de lenda).
function isFootSoldier(kind: Unit['kind']): boolean {
  return kind === 'militia' || kind === 'spearman' || kind === 'archer';
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
  } else if (isFootSoldier(u.kind) && u.noble) {
    // Nobre: montado a cavalo (desenhado em "mount", que gira com a direção) e com lança dourada.
    body.circle(0, -2, 6.5).fill(PLAYER_COLOR);
    body.circle(0, -2, 6.5).stroke({ width: 1.4, color: 0xd9a441 });
    body.circle(0, -3, 3.6).fill(0xd9a441); // elmo dourado
    body.circle(-0.8, -3.8, 1.3).fill(0xffe9a8);
    tool.rect(-5, -1, 22, 1.8).fill(0xb8862e);
    tool.poly([17, -3.4, 23, 0, 17, 3.4]).fill(0xffe08a).stroke({ width: 0.6, color: 0x8a6420 });
  } else if (u.kind === 'militia') {
    body.ellipse(2, 5, 7, 4).fill({ color: 0x000000, alpha: 0.3 });
    body.circle(0, 0, 7).fill(PLAYER_COLOR);
    body.circle(0, 0, 7).stroke({ width: 1.2, color: 0x1d3a78 });
    body.circle(0, -1, 3.8).fill(0x9aa0a6); // elmo
    body.circle(-0.8, -1.8, 1.4).fill(0xc9ced3);
    // Lança
    tool.rect(-4, -1, 18, 1.6).fill(0x6b4a2a);
    tool.poly([14, -3, 19, 0, 14, 3]).fill(0xc9ced3);
  } else if (u.kind === 'spearman') {
    // Lanceiro: elmo de aço com penacho vermelho, escudo redondo e lança longa.
    body.ellipse(2, 5, 7.5, 4).fill({ color: 0x000000, alpha: 0.3 });
    body.circle(0, 0, 7.5).fill(PLAYER_COLOR);
    body.circle(0, 0, 7.5).stroke({ width: 1.4, color: 0x14295a });
    body.circle(0, -1, 4).fill(0xb8bec4);
    body.rect(-1, -7, 2, 4).fill(0xc8283c); // penacho
    body.circle(-5, 3, 4.2).fill(0xb5452e).stroke({ width: 1, color: 0xe8c24a }); // escudo
    tool.rect(-6, -1, 24, 1.8).fill(0x5a3d22);
    tool.poly([18, -3.4, 24, 0, 18, 3.4]).fill(0xd8dde2);
  } else if (u.kind === 'archer') {
    // Arqueiro: capuz verde e arco.
    body.ellipse(2, 5, 6.5, 3.6).fill({ color: 0x000000, alpha: 0.3 });
    body.circle(0, 0, 6.5).fill(PLAYER_COLOR);
    body.circle(0, 0, 6.5).stroke({ width: 1.2, color: 0x1d3a78 });
    body.circle(0, -1, 3.8).fill(0x4f7a3a); // capuz
    body.circle(0.6, -0.4, 2).fill(0xe8c39e);
    tool.arc(4, 0, 8, -1.1, 1.1).stroke({ width: 1.8, color: 0x8b5e34 });
    tool.moveTo(4 + Math.cos(-1.1) * 8, Math.sin(-1.1) * 8).lineTo(4 + Math.cos(1.1) * 8, Math.sin(1.1) * 8).stroke({ width: 0.8, color: 0xe8e0c8 });
  } else {
    body.ellipse(3, 6, 13, 6).fill({ color: 0x000000, alpha: 0.3 });
    body.ellipse(0, 0, 12, 5.5).fill(0x6b4426);
    body.circle(11, -1, 3.5).fill(0x5a381e);
    body.circle(-1, 0, 5).fill(PLAYER_COLOR);
    body.circle(-1, -0.5, 2.8).fill(0xe8c39e);
  }
  const badge = new Graphics();
  const mount = new Graphics();
  if (isFootSoldier(u.kind) && u.noble) {
    mount.ellipse(3, 6, 14, 6).fill({ color: 0x000000, alpha: 0.3 });
    mount.ellipse(0, 0, 13, 6).fill(0xf2efe6); // cavalo branco
    mount.ellipse(0, 0, 13, 6).stroke({ width: 1, color: 0x9a948a });
    mount.ellipse(12, -1, 4.5, 3.4).fill(0xe6e1d6);
    mount.rect(-3, -6, 7, 12).fill(0x2a4f9e); // manta azul
    mount.rect(-3, -6, 7, 12).stroke({ width: 0.8, color: 0xd9a441 });
    mount.rect(-14, -1, 4, 2).fill(0x8a8378); // cauda
  }
  const glow = new Graphics();
  glow.circle(0, 0, 13).stroke({ width: 2, color: 0xffd45a, alpha: 0.8 });
  glow.circle(0, 0, 16).stroke({ width: 1, color: 0xffd45a, alpha: 0.35 });
  glow.visible = false;
  const shield = new Graphics();
  shield.circle(0, -1, 10).stroke({ width: 1.6, color: 0x7fd8ff, alpha: 0.85 });
  shield.visible = false;
  root.addChild(glow, mount, tool, body, carry, shield, badge);
  return { root, body, carry, tool, badge, mount, glow, shield, noble: u.noble, carryKey: '', badgeKey: '' };
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
  if (isFootSoldier(u.kind)) {
    v.mount.rotation = u.facing;
    v.glow.visible = u.level >= 100;
    if (v.glow.visible) v.glow.alpha = 0.6 + Math.sin(timeSec * 3 + u.id) * 0.3;
    v.shield.visible = u.shield > 0;
    // A lança aponta para a frente e estoca durante o combate (o arco só recua um pouco ao atirar).
    const thrust = working ? Math.max(0, Math.sin(timeSec * 8 + u.id)) * (u.kind === 'archer' ? -2 : 5) : 0;
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

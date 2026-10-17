import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import { NavGrid } from '../world/nav';
import { landConnectedFrom } from '../world/connectivity';
import { Tile } from '../world/terrain';
import { setTile } from '../world/world';
import { Rng } from './rng';
import type { Building, ResourceNode, Titan, Unit } from '../entities/types';
import type { GameState } from '../state';

// Efeitos visuais disparados pela simulação (não são salvos; a renderização os consome).
export type Fx =
  | { type: 'steam'; x: number; y: number; size: number }
  | { type: 'arrow'; x: number; y: number; x2: number; y2: number }
  | { type: 'dust'; x: number; y: number; size: number }
  | { type: 'hit'; x: number; y: number };

// Avisos ao jogador (notificação + som). A interface os consome.
export interface Alert {
  kind: 'sighted' | 'underAttack' | 'greatAttack' | 'death' | 'destroyed' | 'victory' | 'chronicle' | 'research' | 'event' | 'promotion' | 'discovery';
  text: string;
  x: number;
  y: number;
}

// Contexto da simulação: o estado salvo + estruturas derivadas (navegação, índices)
// que são reconstruídas ao carregar. Nada aqui depende de renderização.
export class Sim {
  readonly nav: NavGrid;
  readonly rng: Rng;
  private nodesById = new Map<number, ResourceNode>();
  private nodesByTile = new Map<number, ResourceNode>();
  private buildingGrid: Int32Array; // id do edifício em cada tile (0 = nenhum)
  terrainChanges: { tx: number; ty: number }[] = [];
  fx: Fx[] = [];
  alerts: Alert[] = [];
  // Último tick em que cada unidade recalculou o caminho (para limitar recálculos caros; não é salvo).
  lastRepath = new Map<number, number>();
  // Titãs intimidados por uma lenda neste passo (derivado; não é salvo).
  intimidated = new Set<number>();
  // Névoa de guerra: tiles à vista agora (derivado; o que já foi visto fica em state.explored).
  visible: Uint8Array;
  fogVersion = 0; // muda a cada recálculo, para a renderização saber quando redesenhar
  // Portões abertos: até que tick cada um fica aberto (derivado; fecham sozinhos).
  gateOpenUntil = new Map<number, number>();
  private land: Uint8Array | null = null;

  constructor(readonly state: GameState) {
    this.nav = new NavGrid(state.world);
    this.rng = new Rng(state.rngState);
    this.buildingGrid = new Int32Array(state.world.width * state.world.height);
    this.visible = new Uint8Array(state.world.width * state.world.height);
    for (const n of state.world.resourceNodes) this.indexNode(n);
    for (const b of state.buildings) this.occupyBuilding(b);
  }

  // Terra firme ligada ao centro do mapa (calculada uma vez): titãs só surgem nela, nunca em ilhas.
  isLandConnected(tx: number, ty: number): boolean {
    const w = this.state.world;
    if (tx < 0 || ty < 0 || tx >= w.width || ty >= w.height) return false;
    if (!this.land) this.land = landConnectedFrom(w, Math.floor(w.width / 2), Math.floor(w.height / 2));
    return this.land[ty * w.width + tx] === 1;
  }

  get tileSize(): number {
    return BALANCE.world.tileSize;
  }

  // --- Recursos do mapa ---

  private indexNode(n: ResourceNode): void {
    this.nodesById.set(n.id, n);
    this.nodesByTile.set(n.ty * this.state.world.width + n.tx, n);
    this.nav.occupy(n.tx, n.ty);
  }

  node(id: number): ResourceNode | undefined {
    return this.nodesById.get(id);
  }

  nodeAt(tx: number, ty: number): ResourceNode | undefined {
    if (!this.nav.inBounds(tx, ty)) return undefined;
    return this.nodesByTile.get(ty * this.state.world.width + tx);
  }

  removeNode(n: ResourceNode): void {
    this.nodesById.delete(n.id);
    this.nodesByTile.delete(n.ty * this.state.world.width + n.tx);
    this.nav.release(n.tx, n.ty);
    const list = this.state.world.resourceNodes;
    const i = list.indexOf(n);
    if (i >= 0) list.splice(i, 1);
    // Onde havia árvore, fica uma clareira.
    if (n.kind === 'tree') setTile(this.state.world, n.tx, n.ty, Tile.Grass);
    this.terrainChanges.push({ tx: n.tx, ty: n.ty });
  }

  // --- Edifícios, unidades e titãs ---

  // Índices por id para buscas rápidas. São reconstruídos quando a lista muda de tamanho
  // (nasceu, morreu, construiu, destruiu); um id que não está no índice cai na busca linear.
  private unitIndex = new Map<number, Unit>();
  private unitIndexOf: Unit[] | null = null;
  private unitIndexLen = -1;
  private buildingIndex = new Map<number, Building>();
  private buildingIndexOf: Building[] | null = null;
  private buildingIndexLen = -1;

  building(id: number): Building | undefined {
    const list = this.state.buildings;
    if (list !== this.buildingIndexOf || list.length !== this.buildingIndexLen) {
      this.buildingIndex = new Map(list.map((b) => [b.id, b]));
      this.buildingIndexOf = list;
      this.buildingIndexLen = list.length;
    }
    let b = this.buildingIndex.get(id);
    if (!b) {
      b = list.find((x) => x.id === id);
      if (b) this.buildingIndex.set(id, b);
    }
    return b;
  }

  unit(id: number): Unit | undefined {
    const list = this.state.units;
    if (list !== this.unitIndexOf || list.length !== this.unitIndexLen) {
      this.unitIndex = new Map(list.map((u) => [u.id, u]));
      this.unitIndexOf = list;
      this.unitIndexLen = list.length;
    }
    let u = this.unitIndex.get(id);
    if (!u) {
      u = list.find((x) => x.id === id);
      if (u) this.unitIndex.set(id, u);
    }
    return u;
  }

  titan(id: number): Titan | undefined {
    return this.state.titans.find((t) => t.id === id);
  }

  occupyBuilding(b: Building): void {
    const def = BUILDING_DEFS[b.kind];
    // Portões e fazendas não bloqueiam os humanos.
    if (!def.walkable && !def.gate) this.nav.occupy(b.tx, b.ty, def.size, def.size);
    this.fillGrid(b, b.id);
  }

  releaseBuilding(b: Building): void {
    this.buildingIndex.delete(b.id);
    const def = BUILDING_DEFS[b.kind];
    if (!def.walkable && !def.gate) this.nav.release(b.tx, b.ty, def.size, def.size);
    this.fillGrid(b, 0);
  }

  private fillGrid(b: Building, value: number): void {
    const s = BUILDING_DEFS[b.kind].size;
    const w = this.state.world.width;
    for (let y = b.ty; y < b.ty + s; y++) {
      for (let x = b.tx; x < b.tx + s; x++) {
        if (this.nav.inBounds(x, y)) this.buildingGrid[y * w + x] = value;
      }
    }
  }

  buildingIdAt(tx: number, ty: number): number {
    if (!this.nav.inBounds(tx, ty)) return 0;
    return this.buildingGrid[ty * this.state.world.width + tx];
  }

  buildingAt(tx: number, ty: number): Building | undefined {
    const id = this.buildingIdAt(tx, ty);
    return id ? this.building(id) : undefined;
  }

  nextId(): number {
    return this.state.nextId++;
  }

  // Grava o estado do gerador aleatório de volta no estado salvo.
  syncRng(): void {
    this.state.rngState = this.rng.state;
  }
}

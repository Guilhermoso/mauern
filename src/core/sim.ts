import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import { NavGrid } from '../world/nav';
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
  kind: 'sighted' | 'underAttack' | 'greatAttack' | 'death' | 'destroyed' | 'victory' | 'chronicle' | 'research' | 'event';
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

  constructor(readonly state: GameState) {
    this.nav = new NavGrid(state.world);
    this.rng = new Rng(state.rngState);
    this.buildingGrid = new Int32Array(state.world.width * state.world.height);
    for (const n of state.world.resourceNodes) this.indexNode(n);
    for (const b of state.buildings) this.occupyBuilding(b);
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

  building(id: number): Building | undefined {
    return this.state.buildings.find((b) => b.id === id);
  }

  unit(id: number): Unit | undefined {
    return this.state.units.find((u) => u.id === id);
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

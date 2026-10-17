import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import { NavGrid } from '../world/nav';
import { Tile } from '../world/terrain';
import { setTile } from '../world/world';
import { Rng } from './rng';
import type { Building, ResourceNode, Unit } from '../entities/types';
import type { GameState } from '../state';

// Contexto da simulação: o estado salvo + estruturas derivadas (navegação, índices)
// que são reconstruídas ao carregar. Nada aqui depende de renderização.

export class Sim {
  readonly nav: NavGrid;
  readonly rng: Rng;
  private nodesById = new Map<number, ResourceNode>();
  private nodesByTile = new Map<number, ResourceNode>();
  // Tiles cujo visual mudou (recurso esgotado etc.). A renderização consome esta lista.
  terrainChanges: { tx: number; ty: number }[] = [];

  constructor(readonly state: GameState) {
    this.nav = new NavGrid(state.world);
    this.rng = new Rng(state.rngState);
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

  // --- Edifícios e unidades ---

  building(id: number): Building | undefined {
    return this.state.buildings.find((b) => b.id === id);
  }

  unit(id: number): Unit | undefined {
    return this.state.units.find((u) => u.id === id);
  }

  occupyBuilding(b: Building): void {
    const def = BUILDING_DEFS[b.kind];
    if (!def.walkable) this.nav.occupy(b.tx, b.ty, def.size, def.size);
  }

  releaseBuilding(b: Building): void {
    const def = BUILDING_DEFS[b.kind];
    if (!def.walkable) this.nav.release(b.tx, b.ty, def.size, def.size);
  }

  buildingAt(tx: number, ty: number): Building | undefined {
    return this.state.buildings.find((b) => {
      const s = BUILDING_DEFS[b.kind].size;
      return tx >= b.tx && ty >= b.ty && tx < b.tx + s && ty < b.ty + s;
    });
  }

  nextId(): number {
    return this.state.nextId++;
  }

  // Grava o estado do gerador aleatório de volta no estado salvo.
  syncRng(): void {
    this.state.rngState = this.rng.state;
  }
}

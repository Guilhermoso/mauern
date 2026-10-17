import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS, VILLAGER_BUILDS } from '../data/defs';
import type { Sim } from '../core/sim';
import type { BuildingKind, Unit } from '../entities/types';
import type { Camera } from '../render/camera';
import {
  canAfford,
  deleteEntity,
  eraLocked,
  lineTiles,
  placeBuilding,
  placeWallLine,
  setRally,
  smartCommand,
  titanAt,
  trainUnit,
} from '../systems/commands';
import { idleVillagers } from '../systems/queries';
import { battalionCommand, battalionOf, formBattalion } from '../systems/battalions';
import { ringAlarm, stopAlarm } from '../systems/combat';
import { releaseShelter } from '../systems/refuge';
import { setIdle } from '../systems/units';
import { poiAt } from '../systems/expeditions';

export interface Selection {
  units: number[]; // unidades avulsas
  battalions: number[]; // batalhões (selecionados como um só)
  building: number | null;
  node: number | null;
  titan: number | null;
  poi?: number | null; // ponto de interesse fora dos muros
}

export interface CommandMarker {
  x: number;
  y: number;
  time: number; // momento da criação (performance.now)
  color: number;
}

// Controle estilo RTS: seleção (clique, caixa, duplo clique), ordens com o botão direito,
// grupos de controle, atalhos e modo de posicionamento de edifícios.
// A seleção é estado da interface: não faz parte do save.
export class SelectionController {
  selection: Selection = { units: [], battalions: [], building: null, node: null, titan: null };
  placing: BuildingKind | null = null;
  wallStart: { tx: number; ty: number } | null = null; // início da linha de muralha sendo arrastada
  mouseScreen = { x: 0, y: 0 };
  dragStart: { x: number; y: number } | null = null;
  markers: CommandMarker[] = [];
  private groups = new Map<number, Selection>();
  private lastGroupKey = { digit: -1, time: 0 };
  private lastClick = { id: -1, time: 0 };
  private idleCursor = 0;
  private changed = true;

  constructor(
    private sim: Sim,
    private camera: Camera,
    canvas: HTMLCanvasElement,
    private toast: (text: string) => void,
  ) {
    canvas.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => {
      this.mouseScreen = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', (e) => this.onUp(e));
  }

  // true uma vez depois de cada mudança de seleção (para a interface se redesenhar).
  consumeChanged(): boolean {
    const c = this.changed;
    this.changed = false;
    return c;
  }

  get mouseWorld(): { x: number; y: number } {
    return this.camera.screenToWorld(this.mouseScreen.x, this.mouseScreen.y);
  }

  // Tile do canto superior esquerdo do edifício sendo posicionado (centrado no cursor).
  // Tiles da muralha que seria construída (da âncora até o cursor).
  wallPreview(): { tx: number; ty: number }[] {
    if (!this.placing || !BUILDING_DEFS[this.placing].wall) return [];
    const t = this.placementTile()!;
    if (!this.wallStart) return [t];
    return lineTiles(this.wallStart.tx, this.wallStart.ty, t.tx, t.ty);
  }

  placementTile(): { tx: number; ty: number } | null {
    if (!this.placing) return null;
    const size = BUILDING_DEFS[this.placing].size;
    const ts = BALANCE.world.tileSize;
    const m = this.mouseWorld;
    return { tx: Math.floor(m.x / ts - size / 2 + 0.5), ty: Math.floor(m.y / ts - size / 2 + 0.5) };
  }

  dragRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.dragStart) return null;
    const x = Math.min(this.dragStart.x, this.mouseScreen.x);
    const y = Math.min(this.dragStart.y, this.mouseScreen.y);
    const w = Math.abs(this.dragStart.x - this.mouseScreen.x);
    const h = Math.abs(this.dragStart.y - this.mouseScreen.y);
    return w > 5 || h > 5 ? { x, y, w, h } : null;
  }

  // Unidades de um batalhão nunca ficam selecionadas sozinhas: viram a seleção do batalhão inteiro.
  setSelection(sel: Partial<Selection>): void {
    const loose: number[] = [];
    const bats = new Set(sel.battalions ?? []);
    for (const id of sel.units ?? []) {
      const u = this.sim.unit(id);
      // Quem está dentro de um edifício não pode receber ordens: fica fora da seleção
      // (ex.: grupos de controle com aldeões que depois se abrigaram).
      if (!u || u.garrison) continue;
      if (u.battalion) bats.add(u.battalion);
      else loose.push(id);
    }
    this.selection = { units: loose, battalions: [...bats], building: sel.building ?? null, node: sel.node ?? null, titan: sel.titan ?? null, poi: sel.poi ?? null };
    this.changed = true;
  }

  // Todas as unidades selecionadas (avulsas e dos batalhões).
  allSelectedUnits(): number[] {
    const ids = [...this.selection.units];
    for (const b of this.selection.battalions) {
      const bat = battalionOf(this.sim, b);
      if (bat) ids.push(bat.commanderId, ...bat.memberIds);
    }
    return ids;
  }

  clear(): void {
    this.setSelection({});
  }

  selectedVillagers(): number[] {
    return this.selection.units.filter((id) => this.sim.unit(id)?.kind === 'villager');
  }

  // Remove da seleção o que deixou de existir.
  prune(): void {
    const s = this.selection;
    const units = s.units.filter((id) => this.sim.unit(id) && !this.sim.unit(id)!.garrison);
    const building = s.building !== null && this.sim.building(s.building) ? s.building : null;
    const node = s.node !== null && this.sim.node(s.node) ? s.node : null;
    const titan = s.titan !== null && this.sim.titan(s.titan) ? s.titan : null;
    const battalions = s.battalions.filter((id) => battalionOf(this.sim, id));
    // Unidade avulsa que entrou num batalhão também precisa ser reagrupada.
    const regroup = units.some((id) => this.sim.unit(id)?.battalion);
    if (regroup || units.length !== s.units.length || battalions.length !== s.battalions.length || building !== s.building || node !== s.node || titan !== s.titan) {
      this.setSelection({ units, battalions, building, node, titan });
    }
    if (this.placing && this.selectedVillagers().length === 0) this.placing = null;
  }

  startPlacing(kind: BuildingKind): void {
    if (this.selectedVillagers().length === 0) return;
    const locked = eraLocked(this.sim, kind);
    if (locked) {
      this.toast(locked);
      return;
    }
    if (!canAfford(this.sim, BUILDING_DEFS[kind].cost)) {
      this.toast('Recursos insuficientes.');
      return;
    }
    this.placing = kind;
    this.wallStart = null;
  }

  cancelPlacing(): void {
    this.placing = null;
    this.wallStart = null;
  }

  private onDown(e: MouseEvent): void {
    if (e.button === 0) {
      if (this.placing) {
        if (BUILDING_DEFS[this.placing].wall) this.wallStart = this.placementTile();
        else this.tryPlace(e.shiftKey);
        return;
      }
      this.dragStart = { x: e.clientX, y: e.clientY };
    } else if (e.button === 2) {
      if (this.placing) {
        this.cancelPlacing();
        return;
      }
      this.issueRightClick();
    }
  }

  private onUp(e: MouseEvent): void {
    if (e.button === 0 && this.placing && this.wallStart) {
      this.placeWall(e.shiftKey);
      return;
    }
    if (e.button !== 0 || !this.dragStart) return;
    const rect = this.dragRect();
    this.dragStart = null;
    if (rect) this.boxSelect(rect, e.shiftKey);
    else this.clickSelect(e.shiftKey);
  }

  private placeWall(keepPlacing: boolean): void {
    const kind = this.placing!;
    const a = this.wallStart!;
    const b = this.placementTile()!;
    this.wallStart = null;
    const n = placeWallLine(this.sim, kind, a.tx, a.ty, b.tx, b.ty, this.selectedVillagers());
    if (n === 0) this.toast(canAfford(this.sim, BUILDING_DEFS[kind].cost) ? 'Não há onde construir aqui.' : 'Recursos insuficientes.');
    if (!keepPlacing || !canAfford(this.sim, BUILDING_DEFS[kind].cost)) this.cancelPlacing();
  }

  private tryPlace(keepPlacing: boolean): void {
    const kind = this.placing!;
    const t = this.placementTile()!;
    const { error } = placeBuilding(this.sim, kind, t.tx, t.ty, this.selectedVillagers());
    if (error) {
      this.toast(error);
      return;
    }
    if (!keepPlacing || !canAfford(this.sim, BUILDING_DEFS[kind].cost)) this.cancelPlacing();
  }

  private issueRightClick(): void {
    const m = this.mouseWorld;
    const ts = BALANCE.world.tileSize;
    const tx = Math.floor(m.x / ts);
    const ty = Math.floor(m.y / ts);
    const s = this.selection;
    for (const b of s.battalions) battalionCommand(this.sim, b, m.x, m.y);
    if (s.battalions.length && !s.units.length) {
      const enemy = titanAt(this.sim, m.x, m.y) !== null;
      this.markers.push({ x: m.x, y: m.y, time: performance.now(), color: enemy ? 0xff4a3a : 0x7cff6b });
    }
    if (s.units.length) {
      const err = smartCommand(this.sim, s.units, m.x, m.y);
      if (err) this.toast(err);
      const enemy = titanAt(this.sim, m.x, m.y) !== null;
      const target = this.sim.nodeAt(tx, ty) ?? this.sim.buildingAt(tx, ty);
      this.markers.push({ x: m.x, y: m.y, time: performance.now(), color: enemy ? 0xff4a3a : target ? 0xffd34d : 0x7cff6b });
    } else if (s.building !== null) {
      const b = this.sim.building(s.building);
      if (b && BUILDING_DEFS[b.kind].trains.length) {
        setRally(this.sim, b.id, tx, ty);
        this.markers.push({ x: m.x, y: m.y, time: performance.now(), color: 0x6fa8ff });
      }
    }
  }

  private unitAt(wx: number, wy: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    const slack = 6 / this.camera.zoom;
    for (const u of this.sim.state.units) {
      if (u.garrison) continue;
      const r = UNIT_DEFS[u.kind].radius + slack;
      const d = Math.hypot(u.x - wx, u.y - wy);
      if (d <= r && d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    return best;
  }

  private clickSelect(additive: boolean): void {
    const m = this.mouseWorld;
    const ts = BALANCE.world.tileSize;
    const now = performance.now();
    const unitId = this.unitAt(m.x, m.y);
    if (unitId !== null) {
      const unit = this.sim.unit(unitId)!;
      // Duplo clique: todas as unidades do mesmo tipo visíveis na tela.
      if (this.lastClick.id === unitId && now - this.lastClick.time < 350) {
        const v = this.camera.viewRect();
        const same = this.sim.state.units
          .filter((u) => u.kind === unit.kind && !u.garrison && u.x >= v.x && u.x <= v.x + v.w && u.y >= v.y && u.y <= v.y + v.h)
          .map((u) => u.id);
        this.setSelection({ units: same });
      } else if (additive && (this.selection.units.length || this.selection.battalions.length)) {
        const sel = this.selection;
        if (unit.battalion) {
          const battalions = sel.battalions.includes(unit.battalion) ? sel.battalions.filter((b) => b !== unit.battalion) : [...sel.battalions, unit.battalion];
          this.setSelection({ units: sel.units, battalions });
        } else {
          const units = sel.units.includes(unitId) ? sel.units.filter((id) => id !== unitId) : [...sel.units, unitId];
          this.setSelection({ units, battalions: sel.battalions });
        }
      } else {
        this.setSelection({ units: [unitId] });
      }
      this.lastClick = { id: unitId, time: now };
      return;
    }
    if (additive) return;
    const titanId = titanAt(this.sim, m.x, m.y);
    if (titanId !== null) {
      this.setSelection({ titan: titanId });
      return;
    }
    const tx = Math.floor(m.x / ts);
    const ty = Math.floor(m.y / ts);
    const b = this.sim.buildingAt(tx, ty);
    if (b) {
      this.setSelection({ building: b.id });
      return;
    }
    const poi = poiAt(this.sim, tx, ty);
    if (poi) {
      this.setSelection({ poi: poi.id });
      return;
    }
    const n = this.sim.nodeAt(tx, ty);
    if (n) {
      this.setSelection({ node: n.id });
      return;
    }
    this.clear();
  }

// Unidades dentro da caixa de seleção (em coordenadas de tela). Com alguma unidade militar na
  // caixa, só as militares contam (aldeões ficam de fora).
  boxUnits(rect: { x: number; y: number; w: number; h: number }): Unit[] {
    const a = this.camera.screenToWorld(rect.x, rect.y);
    const b = this.camera.screenToWorld(rect.x + rect.w, rect.y + rect.h);
    let inside = this.sim.state.units.filter((u) => !u.garrison && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y);
    if (inside.some((u) => UNIT_DEFS[u.kind].military)) inside = inside.filter((u) => UNIT_DEFS[u.kind].military);
    return inside;
  }

  // O que a caixa vai selecionar ao soltar o botão (batalhões entram inteiros), para o destaque.
  boxPreview(): Unit[] {
    const rect = this.placing ? null : this.dragRect();
    if (!rect) return [];
    const inside = this.boxUnits(rect);
    const out = new Set(inside);
    for (const u of inside) {
      if (!u.battalion) continue;
      for (const m of this.sim.state.units) if (m.battalion === u.battalion && !m.garrison) out.add(m);
    }
    return [...out];
  }

  private boxSelect(rect: { x: number; y: number; w: number; h: number }, additive: boolean): void {
    const inside = this.boxUnits(rect).map((u) => u.id);
    if (additive) {
      this.setSelection({ units: [...new Set([...this.selection.units, ...inside])], battalions: this.selection.battalions });
    } else if (inside.length) {
      this.setSelection({ units: inside });
    } else {
      this.clear();
    }
  }

  centerOnSelection(): void {
    const s = this.selection;
    const ts = BALANCE.world.tileSize;
    const units = this.allSelectedUnits().map((id) => this.sim.unit(id)).filter((u) => !!u && !u.garrison);
    if (units.length) {
      const x = units.reduce((sum, u) => sum + u!.x, 0) / units.length;
      const y = units.reduce((sum, u) => sum + u!.y, 0) / units.length;
      this.camera.centerOn(x, y);
    } else if (s.building !== null) {
      const b = this.sim.building(s.building);
      if (b) {
        const size = BUILDING_DEFS[b.kind].size;
        this.camera.centerOn((b.tx + size / 2) * ts, (b.ty + size / 2) * ts);
      }
    }
  }

  selectNextIdle(): void {
    const idle = idleVillagers(this.sim).filter((u) => !u.garrison);
    if (!idle.length) {
      this.toast('Nenhum aldeão ocioso.');
      return;
    }
    this.idleCursor = (this.idleCursor + 1) % idle.length;
    this.setSelection({ units: [idle[this.idleCursor].id] });
    this.centerOnSelection();
  }

  formBattalionFromSelection(): void {
    const { battalion, error, leftOut } = formBattalion(this.sim, this.selection.units);
    if (error) {
      this.toast(error);
      return;
    }
    if (leftOut) this.toast(`${leftOut} soldado(s) não couberam: o nível do comandante limita o tamanho do batalhão.`);
    this.setSelection({ battalions: [...this.selection.battalions, battalion!.id], units: this.selection.units.filter((id) => !this.sim.unit(id)?.battalion) });
  }

  stopSelected(): void {
    for (const b of this.selection.battalions) {
      const bat = battalionOf(this.sim, b);
      if (bat) {
        bat.mode = 'manual';
        bat.order = { type: 'idle' };
      }
    }
    for (const id of this.selection.units) {
      const u = this.sim.unit(id);
      if (u) setIdle(u);
    }
  }

  deleteSelected(): void {
    const s = this.selection;
    if (s.building !== null) {
      const b = this.sim.building(s.building);
      if (!b) return;
      if (b.kind === 'townCenter') {
        this.toast('O Centro da Vila não pode ser demolido.');
        return;
      }
      if (b.built && !window.confirm(`Demolir ${BUILDING_DEFS[b.kind].name}?`)) return;
      deleteEntity(this.sim, b.id);
    } else if (s.units.length) {
      const n = s.units.length;
      if (!window.confirm(n === 1 ? 'Dispensar esta unidade? Ela será perdida.' : `Dispensar ${n} unidades? Elas serão perdidas.`)) return;
      for (const id of s.units) deleteEntity(this.sim, id);
    }
    this.prune();
  }

  // Trata atalhos de teclado. Retorna true se a tecla foi usada.
  handleKey(e: KeyboardEvent): boolean {
    const s = this.selection;
    if (e.code === 'Escape') {
      if (this.placing) {
        this.cancelPlacing();
        return true;
      }
      if (s.units.length || s.battalions.length || s.building !== null || s.node !== null || s.titan !== null) {
        this.clear();
        return true;
      }
      return false;
    }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) {
      const d = Number(digit[1]);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups.set(d, { units: [...s.units], battalions: [...s.battalions], building: s.building, node: null, titan: null });
        this.toast(`Grupo ${d} definido.`);
        return true;
      }
      const g = this.groups.get(d);
      if (g) {
        const now = performance.now();
        this.setSelection({ units: g.units.filter((id) => this.sim.unit(id)), battalions: g.battalions, building: g.building });
        this.prune();
        if (this.lastGroupKey.digit === d && now - this.lastGroupKey.time < 400) this.centerOnSelection();
        this.lastGroupKey = { digit: d, time: now };
      }
      return true;
    }
    if (e.code === 'Period') {
      this.selectNextIdle();
      return true;
    }
    if (e.code === 'Delete') {
      this.deleteSelected();
      return true;
    }
    if (e.code === 'KeyH') {
      const tc = this.sim.state.buildings.find((b) => b.kind === 'townCenter');
      if (tc) {
        this.setSelection({ building: tc.id });
        this.centerOnSelection();
      }
      return true;
    }
    if (e.code === 'KeyB' && s.units.some((id) => { const u = this.sim.unit(id); return u && UNIT_DEFS[u.kind].military; })) {
      this.formBattalionFromSelection();
      return true;
    }
    if (this.selectedVillagers().length) {
      const kind = VILLAGER_BUILDS.find((k) => BUILDING_DEFS[k].hotkey === e.code);
      if (kind) {
        this.startPlacing(kind);
        return true;
      }
    }
    if (s.building !== null && e.code === 'KeyU') {
      if (releaseShelter(this.sim, s.building, false) === 0) this.toast('Ninguém pode sair agora.');
      return true;
    }
    if (s.building !== null && e.code === 'KeyB' && this.sim.building(s.building)?.kind === 'townCenter') {
      if (this.sim.state.alarm) stopAlarm(this.sim);
      else ringAlarm(this.sim);
      return true;
    }
    if (s.building !== null) {
      const b = this.sim.building(s.building);
      const kind = b && BUILDING_DEFS[b.kind].trains.find((k) => UNIT_DEFS[k].hotkey === e.code);
      if (b && kind) {
        // Militares: Shift enfileira um lote cheio. Aldeões: Shift enfileira 5, um por vez.
        const military = UNIT_DEFS[kind].military;
        const times = e.shiftKey && !military ? 5 : 1;
        for (let i = 0; i < times; i++) {
          const err = trainUnit(this.sim, b.id, kind, e.shiftKey && military);
          if (err) {
            this.toast(err);
            break;
          }
        }
        return true;
      }
    }
    return false;
  }
}

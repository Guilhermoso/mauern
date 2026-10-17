import { BUILDING_DEFS, NODE_DEFS, RESOURCE_NAMES, UNIT_DEFS, VILLAGER_BUILDS, formatCost } from '../data/defs';
import type { Sim } from '../core/sim';
import type { SelectionController } from '../input/selection';
import { populationCap } from '../state';
import { canAfford, cancelTrain, trainUnit } from '../systems/commands';
import { unitStatus } from '../systems/units';
import type { Unit, UnitKind } from '../entities/types';

// Painel inferior: informações do que está selecionado e botões de comando.
// O conteúdo só é reconstruído quando a "estrutura" muda (outra seleção, fila diferente etc.);
// valores que mudam o tempo todo (vida, progresso) são atualizados no lugar, para não
// recriar botões enquanto o jogador clica neles.
export class BottomPanel {
  readonly el = document.createElement('div');
  private info = document.createElement('div');
  private commands = document.createElement('div');
  private key = '';
  private updaters: (() => void)[] = [];

  constructor(private sim: Sim, private sel: SelectionController, private toast: (t: string) => void) {
    this.el.className = 'bottom panel hidden';
    this.info.className = 'bp-info';
    this.commands.className = 'bp-commands';
    this.el.append(this.info, this.commands);
  }

  update(): void {
    const key = this.structureKey();
    if (key !== this.key) {
      this.key = key;
      this.rebuild();
    }
    for (const fn of this.updaters) fn();
  }

  private structureKey(): string {
    const s = this.sel.selection;
    if (s.units.length) {
      const one = s.units.length === 1 ? this.sim.unit(s.units[0])?.kind : '';
      return `u:${s.units.join(',')}:${one}`;
    }
    if (s.building !== null) {
      const b = this.sim.building(s.building);
      return b ? `b:${b.id}:${b.built}:${b.queue.length}` : '';
    }
    if (s.node !== null) return `n:${s.node}`;
    return '';
  }

  private rebuild(): void {
    this.info.innerHTML = '';
    this.commands.innerHTML = '';
    this.updaters = [];
    const s = this.sel.selection;
    this.el.classList.toggle('hidden', this.key === '');
    if (s.units.length) this.buildUnits(s.units);
    else if (s.building !== null) this.buildBuilding(s.building);
    else if (s.node !== null) this.buildNode(s.node);
  }

  private buildUnits(ids: number[]): void {
    const units = ids.map((id) => this.sim.unit(id)).filter((u): u is Unit => !!u);
    if (units.length === 1) {
      const u = units[0];
      const def = UNIT_DEFS[u.kind];
      const title = el('div', 'bp-title', u.name);
      const sub = el('div', 'bp-sub', def.name);
      const hp = el('div', 'bp-line');
      const status = el('div', 'bp-line');
      this.info.append(title, sub, hp, status);
      this.updaters.push(() => {
        hp.textContent = `Vida: ${Math.ceil(u.hp)}/${def.maxHp}`;
        status.textContent = unitStatus(this.sim, u);
      });
    } else {
      const counts = new Map<UnitKind, number>();
      for (const u of units) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
      this.info.append(el('div', 'bp-title', `${units.length} unidades`));
      for (const [kind, n] of counts) this.info.append(el('div', 'bp-line', `${n}× ${UNIT_DEFS[kind].name}`));
    }

    if (units.some((u) => u.kind === 'villager')) {
      for (const kind of VILLAGER_BUILDS) {
        const def = BUILDING_DEFS[kind];
        const letter = def.hotkey?.replace('Key', '') ?? '';
        const b = cmdButton(def.name, formatCost(def.cost), letter, `${def.name}: ${def.description}`, () => this.sel.startPlacing(kind));
        this.commands.appendChild(b);
        this.updaters.push(() => b.classList.toggle('disabled', !canAfford(this.sim, def.cost)));
      }
    }
    this.commands.appendChild(cmdButton('Parar', '', '', 'Interrompe a ordem atual', () => this.sel.stopSelected()));
    this.commands.appendChild(dangerButton('Dispensar', 'Del', () => this.sel.deleteSelected()));
  }

  private buildBuilding(id: number): void {
    const b = this.sim.building(id);
    if (!b) return;
    const def = BUILDING_DEFS[b.kind];
    this.info.append(el('div', 'bp-title', def.name));
    const hp = el('div', 'bp-line');
    this.info.append(hp);
    this.updaters.push(() => (hp.textContent = `Vida: ${Math.ceil(b.hp)}/${def.maxHp}`));

    if (!b.built) {
      const p = el('div', 'bp-line');
      const prog = progressBar();
      this.info.append(p, prog.el);
      this.updaters.push(() => {
        const frac = b.progress / def.buildTime;
        p.textContent = `Em construção: ${Math.floor(frac * 100)}%`;
        prog.set(frac);
      });
      this.info.append(el('div', 'bp-hint', 'Clique com o botão direito com aldeões selecionados para ajudar a construir.'));
      this.commands.appendChild(dangerButton('Cancelar construção', 'Del', () => this.sel.deleteSelected()));
      return;
    }

    this.info.append(el('div', 'bp-sub', def.description));
    if (def.dropsite.length && b.kind !== 'townCenter') {
      this.info.append(el('div', 'bp-line', `Recebe: ${def.dropsite.map((r) => RESOURCE_NAMES[r].toLowerCase()).join(', ')}`));
    }
    if (b.kind === 'farm') {
      const f = el('div', 'bp-line');
      this.info.append(f);
      this.updaters.push(() => {
        const farmer = b.farmerId ? this.sim.unit(b.farmerId) : undefined;
        const working = farmer && farmer.order.type === 'farm' && farmer.order.buildingId === b.id;
        f.textContent = working ? `Fazendeiro: ${farmer.name}` : 'Sem fazendeiro — clique com o botão direito com um aldeão.';
      });
    }

    for (const kind of def.trains) {
      const udef = UNIT_DEFS[kind];
      const btn = cmdButton(`Treinar ${udef.name.toLowerCase()}`, formatCost(udef.cost), 'Q', `${udef.name} (${udef.trainTime}s). Shift+Q treina 5.`, () => {
        const err = trainUnit(this.sim, b.id, kind);
        if (err) this.toast(err);
      });
      this.commands.appendChild(btn);
      this.updaters.push(() => btn.classList.toggle('disabled', !canAfford(this.sim, udef.cost)));
    }

    if (def.trains.length) {
      const queue = el('div', 'bp-queue');
      b.queue.forEach((item, i) => {
        const q = document.createElement('button');
        q.className = 'bp-qitem';
        q.title = 'Clique para cancelar';
        q.textContent = UNIT_DEFS[item.kind].name[0];
        q.onclick = () => cancelTrain(this.sim, b.id, i);
        if (i === 0) {
          const bar = progressBar();
          q.appendChild(bar.el);
          this.updaters.push(() => bar.set(item.progress / UNIT_DEFS[item.kind].trainTime));
        }
        queue.appendChild(q);
      });
      const pop = el('div', 'bp-line');
      this.info.append(queue, pop);
      this.updaters.push(() => {
        const cap = populationCap(this.sim.state);
        const n = this.sim.state.units.length;
        pop.textContent = n >= cap && b.queue.length ? `População no limite (${n}/${cap}) — construa casas!` : '';
        pop.classList.toggle('warn', n >= cap);
      });
      this.info.append(el('div', 'bp-hint', 'Botão direito no mapa define o ponto de reunião.'));
    }
    if (b.kind !== 'townCenter') this.commands.appendChild(dangerButton('Demolir', 'Del', () => this.sel.deleteSelected()));
  }

  private buildNode(id: number): void {
    const n = this.sim.node(id);
    if (!n) return;
    const def = NODE_DEFS[n.kind];
    this.info.append(el('div', 'bp-title', def.name));
    const amount = el('div', 'bp-line');
    this.info.append(amount);
    this.updaters.push(() => (amount.textContent = `${RESOURCE_NAMES[def.resource]}: ${Math.ceil(n.amount)}`));
    if (!def.gatherable) this.info.append(el('div', 'bp-hint', 'Um mistério. Talvez um dia saibamos para que servem.'));
    else this.info.append(el('div', 'bp-hint', 'Selecione aldeões e clique com o botão direito para coletar.'));
  }
}

function el(tag: string, cls: string, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}

function cmdButton(label: string, cost: string, hotkey: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'cmd';
  b.title = title;
  b.innerHTML = `<span class="cmd-label"></span><span class="cmd-cost"></span>${hotkey ? `<span class="cmd-key">${hotkey}</span>` : ''}`;
  b.querySelector('.cmd-label')!.textContent = label;
  b.querySelector('.cmd-cost')!.textContent = cost;
  b.onclick = onClick;
  return b;
}

function dangerButton(label: string, hotkey: string, onClick: () => void): HTMLButtonElement {
  const b = cmdButton(label, '', hotkey, label, onClick);
  b.classList.add('danger');
  return b;
}

function progressBar(): { el: HTMLElement; set(frac: number): void } {
  const outer = el('div', 'bp-bar');
  const inner = el('div', 'bp-bar-fill');
  outer.appendChild(inner);
  return { el: outer, set: (f) => (inner.style.width = `${Math.max(0, Math.min(1, f)) * 100}%`) };
}

import { BUILDING_DEFS, NODE_DEFS, RESOURCE_NAMES, UNIT_DEFS, VILLAGER_BUILDS, formatCost, unitNoun } from '../data/defs';
import { isFemaleName } from '../entities/names';
import type { Sim } from '../core/sim';
import type { SelectionController } from '../input/selection';
import { populationCap } from '../state';
import { canAfford, cancelTrain, trainUnit, ungarrison } from '../systems/commands';
import { unitStatus } from '../systems/units';
import { garrisonCount } from '../systems/damage';
import { ringAlarm, stopAlarm } from '../systems/combat';
import { availableTechs, cancelResearch, startResearch } from '../systems/research';
import { TECH_DEFS, type TechId } from '../data/techs';
import { BALANCE } from '../data/balance';
import { missingNeeds, serviceRadius } from '../systems/city';
import { buildingMaxHp, unitMaxHp } from '../systems/modifiers';
import { housingOf } from '../state';
import type { Building, Unit, UnitKind } from '../entities/types';

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
      return b
        ? `b:${b.id}:${b.built}:${b.queue.length}:${garrisonCount(this.sim, b) > 0}:${this.sim.state.alarm}:${b.research?.tech ?? ''}:${this.sim.state.techs.length}:${b.level}`
        : '';
    }
    if (s.node !== null) return `n:${s.node}`;
    if (s.titan !== null) return `t:${s.titan}`;
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
    else if (s.titan !== null) this.buildTitan(s.titan);
  }

  private buildTitan(id: number): void {
    const t = this.sim.titan(id);
    if (!t) return;
    this.info.append(el('div', 'bp-title', 'Titã'));
    this.info.append(el('div', 'bp-sub', `${t.height.toFixed(1).replace('.', ',')} metros de altura`));
    const hp = el('div', 'bp-line');
    const status = el('div', 'bp-line');
    this.info.append(hp, status);
    this.updaters.push(() => {
      hp.textContent = `Vida: ${Math.ceil(t.hp)}/${t.maxHp}`;
      status.textContent =
        t.targetKind === 'unit' ? 'Caçando humanos' : t.targetKind === 'building' ? 'Destruindo construções' : t.targetKind === 'march' ? 'Marchando para a cidade' : 'Vagando';
    });
    this.info.append(el('div', 'bp-hint', 'Selecione soldados e clique com o botão direito no titã para atacar. Torres e o Centro da Vila (com gente dentro) atiram flechas.'));
  }

  private buildUnits(ids: number[]): void {
    const units = ids.map((id) => this.sim.unit(id)).filter((u): u is Unit => !!u);
    if (units.length === 1) {
      const u = units[0];
      const title = el('div', 'bp-title', u.name);
      const sub = el('div', 'bp-sub', unitNoun(u.kind, isFemaleName(u.name)));
      const hp = el('div', 'bp-line');
      const status = el('div', 'bp-line');
      this.info.append(title, sub, hp, status);
      this.updaters.push(() => {
        hp.textContent = `Vida: ${Math.ceil(u.hp)}/${unitMaxHp(this.sim.state, u)}`;
        status.textContent = unitStatus(this.sim, u);
      });
    } else {
      const counts = new Map<UnitKind, number>();
      for (const u of units) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
      this.info.append(el('div', 'bp-title', `${units.length} unidades`));
      for (const [kind, n] of counts) this.info.append(el('div', 'bp-line', `${n}× ${UNIT_DEFS[kind].name}`));
    }

    this.info.append(el('div', 'bp-hint', 'Clique direito: andar, coletar, construir, reparar, abrigar ou atacar.'));
    if (units.some((u) => u.kind === 'villager')) {
      for (const kind of VILLAGER_BUILDS) {
        const def = BUILDING_DEFS[kind];
        const letter = def.hotkey?.replace('Key', '') ?? '';
        const label = def.wall ? `${def.name} (por segmento)` : def.name;
        const b = cmdButton(label, formatCost(def.cost), letter, `${def.name}: ${def.description}`, () => this.sel.startPlacing(kind));
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
    const title = b.kind === 'house' && b.built ? BALANCE.city.houseLevelNames[b.level - 1] : def.name;
    this.info.append(el('div', 'bp-title', title));
    const hp = el('div', 'bp-line');
    this.info.append(hp);
    this.updaters.push(() => (hp.textContent = `Vida: ${Math.ceil(b.hp)}/${buildingMaxHp(this.sim.state, b)}`));

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
    const dmg = el('div', 'bp-hint');
    this.info.append(dmg);
    this.updaters.push(() => (dmg.textContent = b.hp < buildingMaxHp(this.sim.state, b) ? 'Danificado: aldeões podem reparar (botão direito).' : ''));
    if (b.kind === 'house') this.buildHouseInfo(b);
    if (b.kind === 'well' || b.kind === 'bonfire') {
      this.info.append(el('div', 'bp-line', `Alcance: ${serviceRadius(this.sim, b.kind)} tiles (círculo no mapa)`));
    }
    this.buildResearch(b);
    if (def.garrison > 0) {
      const g = el('div', 'bp-line');
      this.info.append(g);
      this.updaters.push(() => (g.textContent = `Abrigados: ${garrisonCount(this.sim, b)}/${def.garrison}`));
      if (garrisonCount(this.sim, b) > 0) {
        this.commands.appendChild(cmdButton('Liberar abrigados', '', 'U', 'Todos saem do edifício', () => ungarrison(this.sim, b.id)));
      }
    }
    if (b.kind === 'townCenter') {
      const alarm = this.sim.state.alarm;
      const bellBtn = cmdButton(
        alarm ? 'Desligar o sino' : 'Tocar o sino',
        alarm ? 'todos voltam ao trabalho' : 'aldeões se abrigam',
        'B',
        alarm ? 'Fim do alarme: os aldeões saem e retomam o que faziam.' : 'Sino de alarme: os aldeões correm para o Centro da Vila e as torres.',
        () => (this.sim.state.alarm ? stopAlarm(this.sim) : ringAlarm(this.sim)),
      );
      if (alarm) bellBtn.classList.add('active-alarm');
      this.commands.appendChild(bellBtn);
    }
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
      const key = udef.hotkey.replace('Key', '');
      const btn = cmdButton(`Treinar ${udef.name.toLowerCase()}`, formatCost(udef.cost), key, `${udef.name} (${udef.trainTime}s). Shift+${key} treina 5.`, () => {
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

  private buildHouseInfo(b: Building): void {
    const C = BALANCE.city;
    this.info.append(el('div', 'bp-line', `Moradores: ${housingOf(b)} · Impostos: ${C.houseTaxPerDay[b.level - 1]} ouro/dia`));
    const need = el('div', 'bp-hint');
    this.info.append(need);
    this.updaters.push(() => {
      const losing = missingNeeds(this.sim, b, b.level);
      if (losing.length) {
        need.textContent = `Faltando: ${losing.join(', ')}. A casa vai regredir se continuar assim.`;
        return;
      }
      if (b.level >= 3) {
        need.textContent = 'Nível máximo desta era.';
        return;
      }
      const next = missingNeeds(this.sim, b, b.level + 1);
      if (b.level + 1 === 3 && this.sim.state.resources.stone < C.level3StoneCost) next.push(`${C.level3StoneCost} de pedra`);
      need.textContent = next.length
        ? `Para virar ${C.houseLevelNames[b.level].toLowerCase()}: ${next.join(', ')}.`
        : `Evoluindo para ${C.houseLevelNames[b.level].toLowerCase()}...`;
    });
  }

  private buildResearch(b: Building): void {
    if (b.research) {
      const tech = TECH_DEFS[b.research.tech as TechId];
      const line = el('div', 'bp-line bp-research');
      const bar = progressBar();
      this.info.append(line, bar.el);
      const r = b.research;
      this.updaters.push(() => {
        line.textContent = `Pesquisando: ${tech.name} (${Math.floor((r.progress / tech.time) * 100)}%)`;
        bar.set(r.progress / tech.time);
      });
      this.commands.appendChild(dangerButton('Cancelar pesquisa', '', () => cancelResearch(this.sim, b.id)));
      return;
    }
    for (const id of availableTechs(this.sim, b)) {
      const t = TECH_DEFS[id];
      const days = t.time / BALANCE.time.secondsPerDay;
      const btn = cmdButton(t.name, formatCost(t.cost), '', `${t.description} Duração: ${days.toFixed(1).replace('.', ',')} dia(s) de jogo.`, () => {
        const err = startResearch(this.sim, b.id, id);
        if (err) this.toast(err);
      });
      btn.classList.add('tech');
      this.commands.appendChild(btn);
      this.updaters.push(() => btn.classList.toggle('disabled', !canAfford(this.sim, t.cost)));
    }
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

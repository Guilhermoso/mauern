import { CHRONICLES, CHRONICLE_IDS } from '../data/chronicles';
import type { Sim } from '../core/sim';
import { ERA_NAMES, ERA_UNLOCKS, advanceEra, eraMilestones } from '../systems/era';
import { EVENT_DEFS, resolveEvent } from '../systems/events';
import { rankName } from '../data/ranks';
import { LORE } from '../data/lore';
import { POI_HINTS, POI_NAMES, poiDirection, readLore } from '../systems/expeditions';
import { UNIT_DEFS } from '../data/defs';

// Painéis em janela: Caminho para a Próxima Era, Crônicas e cartas de evento.

function modalShell(title: string, onClose: () => void): { backdrop: HTMLDivElement; body: HTMLDivElement } {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop hidden';
  const modal = document.createElement('div');
  modal.className = 'modal wide panel';
  const head = document.createElement('div');
  head.className = 'modal-head';
  const h = document.createElement('h2');
  h.textContent = title;
  const close = document.createElement('button');
  close.textContent = 'Fechar';
  close.onclick = onClose;
  head.append(h, close);
  const body = document.createElement('div');
  body.className = 'modal-body';
  modal.append(head, body);
  backdrop.appendChild(modal);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) onClose();
  });
  return { backdrop, body };
}

export class EraPanel {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;

  constructor(private sim: Sim) {
    const shell = modalShell('Caminho para a Próxima Era', () => this.close());
    this.el = shell.backdrop;
    this.body = shell.body;
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
  }

  render(): void {
    const s = this.sim.state;
    this.body.innerHTML = '';
    const intro = document.createElement('p');
    intro.className = 'muted';
    intro.textContent = `Você está na ${ERA_NAMES[s.era]}. Para a vila evoluir para a ${ERA_NAMES[s.era + 1] ?? '?'}, cumpra todos os marcos abaixo. Não há pressa: cada era tem muito a construir.`;
    this.body.appendChild(intro);
    if (s.era >= 1) {
      intro.textContent = `Você está na ${ERA_NAMES[s.era]}. ${ERA_UNLOCKS[s.era]}`;
      const note = document.createElement('p');
      note.className = 'muted small';
      note.textContent = `Os marcos para a ${ERA_NAMES[s.era + 1]} chegam numa próxima atualização, junto com o resto da Era II (ferraria, estábulo, carroça de suprimentos, estradas e mais). Seu progresso fica guardado.`;
      this.body.appendChild(note);
      return;
    }
    const list = document.createElement('ul');
    list.className = 'checklist';
    const ms = eraMilestones(this.sim);
    for (const m of ms) {
      const li = document.createElement('li');
      li.className = m.done ? 'done' : '';
      li.innerHTML = `<span class="mark">${m.done ? '✔' : '○'}</span><span class="label"></span><span class="prog"></span>`;
      li.querySelector('.label')!.textContent = m.label;
      li.querySelector('.prog')!.textContent = m.progress;
      list.appendChild(li);
    }
    this.body.appendChild(list);
    const btn = document.createElement('button');
    btn.className = 'era-btn';
    const all = ms.every((m) => m.done);
    btn.disabled = !all;
    btn.textContent = `Avançar para a ${ERA_NAMES[s.era + 1]}`;
    btn.title = all ? 'Todos os marcos cumpridos!' : 'Cumpra todos os marcos para avançar.';
    btn.onclick = () => {
      if (!advanceEra(this.sim)) this.render();
    };
    this.body.appendChild(btn);
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = `Na ${ERA_NAMES[s.era + 1]}: ${ERA_UNLOCKS[s.era + 1]}`;
    this.body.appendChild(note);
  }
}

export class ChroniclesPanel {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;

  constructor(private sim: Sim) {
    const shell = modalShell('Crônicas da Era I', () => this.close());
    this.el = shell.backdrop;
    this.body = shell.body;
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
  }

  render(): void {
    const s = this.sim.state;
    this.body.innerHTML = '';
    const ids = CHRONICLE_IDS.filter((id) => CHRONICLES[id].era <= s.era);
    const done = ids.filter((id) => s.relics.includes(id)).length;
    const intro = document.createElement('p');
    intro.className = 'muted';
    intro.textContent = `Objetivos opcionais. Cada crônica cumprida dá uma relíquia com um bônus permanente. Cumpridas: ${done}/${ids.length}.`;
    this.body.appendChild(intro);
    const grid = document.createElement('div');
    grid.className = 'chronicles';
    for (const id of ids) {
      const c = CHRONICLES[id];
      const got = s.relics.includes(id);
      const card = document.createElement('div');
      card.className = `chronicle ${got ? 'done' : ''}`;
      card.innerHTML = '<div class="c-name"></div><div class="c-desc"></div><div class="c-relic"></div>';
      card.querySelector('.c-name')!.textContent = `${got ? '✔ ' : ''}${c.name}`;
      card.querySelector('.c-desc')!.textContent = c.description;
      card.querySelector('.c-relic')!.textContent = `${c.relic}: ${c.relicDescription}`;
      grid.appendChild(card);
    }
    this.body.appendChild(grid);
  }
}

// Carta de evento: pausa o jogo enquanto o jogador decide.
export class EventCard {
  readonly el = document.createElement('div');
  private shownId = '';

  constructor(private sim: Sim, private onResolved: (text: string) => void) {
    this.el.className = 'modal-backdrop hidden';
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  // Mostra a carta se houver um evento ativo. Retorna true se está aberta.
  update(): boolean {
    const active = this.sim.state.events.active;
    if (!active) {
      if (this.isOpen) this.el.classList.add('hidden');
      this.shownId = '';
      return false;
    }
    const key = `${active.id}:${JSON.stringify(active.data)}`;
    if (key !== this.shownId) {
      this.shownId = key;
      this.render();
    } else {
      this.refreshEnabled();
    }
    this.el.classList.remove('hidden');
    return true;
  }

  private buttons: HTMLButtonElement[] = [];

  private render(): void {
    const active = this.sim.state.events.active!;
    const def = EVENT_DEFS[active.id];
    this.el.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'modal panel event-card';
    const h = document.createElement('h2');
    h.textContent = def.title;
    const p = document.createElement('p');
    p.textContent = def.text(this.sim, active.data);
    card.append(h, p);
    this.buttons = def.choices.map((c, i) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = '<span class="c-label"></span><span class="c-detail"></span>';
      b.querySelector('.c-label')!.textContent = c.label;
      b.querySelector('.c-detail')!.textContent = c.detail;
      b.onclick = () => {
        const result = resolveEvent(this.sim, i);
        if (result) this.onResolved(result);
      };
      card.appendChild(b);
      return b;
    });
    this.refreshEnabled();
    this.el.appendChild(card);
  }

  private refreshEnabled(): void {
    const active = this.sim.state.events.active;
    if (!active) return;
    EVENT_DEFS[active.id].choices.forEach((c, i) => {
      const ok = !c.enabled || c.enabled(this.sim, active.data);
      if (this.buttons[i]) this.buttons[i].disabled = !ok;
    });
  }
}

// Memorial: todos os moradores que morreram, do mais recente ao mais antigo.
export class MemorialPanel {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;

  constructor(private sim: Sim) {
    const shell = modalShell('Memorial', () => this.close());
    this.el = shell.backdrop;
    this.body = shell.body;
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
  }

  render(): void {
    const list = this.sim.state.memorial;
    this.body.innerHTML = '';
    const intro = document.createElement('p');
    intro.className = 'muted';
    intro.textContent = list.length
      ? `Em memória dos ${list.length} que deram a vida pela muralha. Seus nomes não serão esquecidos.`
      : 'Nenhum nome gravado ainda. Que continue assim.';
    this.body.appendChild(intro);
    if (!list.length) return;
    const table = document.createElement('div');
    table.className = 'memorial';
    for (const m of [...list].reverse()) {
      const row = document.createElement('div');
      row.className = `memorial-row ${m.noble ? 'noble' : ''}`;
      const military = UNIT_DEFS[m.kind].military && m.kind !== 'scout';
      const who = `${m.noble ? '♛ ' : ''}${m.name}`;
      const what = military ? `${rankName(m.level)} · ${m.kills} titãs` : UNIT_DEFS[m.kind].name;
      row.innerHTML = '<span class="m-name"></span><span class="m-what"></span><span class="m-cause"></span><span class="m-day"></span>';
      row.querySelector('.m-name')!.textContent = who;
      row.querySelector('.m-what')!.textContent = what;
      row.querySelector('.m-cause')!.textContent = m.cause;
      row.querySelector('.m-day')!.textContent = `dia ${m.day}`;
      table.appendChild(row);
    }
    this.body.appendChild(table);
  }
}

// Descobertas: pontos de interesse encontrados fora dos muros e os fragmentos de história já lidos.
export class DiscoveriesPanel {
  readonly el: HTMLDivElement;
  private body: HTMLDivElement;

  constructor(private sim: Sim, private goTo: (tx: number, ty: number) => void) {
    const shell = modalShell('Descobertas', () => this.close());
    this.el = shell.backdrop;
    this.body = shell.body;
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
  }

  render(): void {
    const pois = this.sim.state.pois;
    this.body.innerHTML = '';
    const found = pois.filter((p) => p.discovered);
    const intro = document.createElement('p');
    intro.className = 'muted';
    intro.textContent = `Fora dos muros há muito a encontrar. Explore com batedores e escolte quem for trabalhar lá fora. Encontrados: ${found.length} de ${pois.length}.`;
    this.body.appendChild(intro);
    const list = document.createElement('div');
    list.className = 'chronicles';
    for (const p of found) {
      const card = document.createElement('button');
      card.className = `chronicle poi-card ${p.done ? 'done' : ''}`;
      card.title = 'Clique para ver no mapa';
      card.innerHTML = '<div class="c-name"></div><div class="c-desc"></div>';
      card.querySelector('.c-name')!.textContent = `${p.done ? '✔ ' : ''}${POI_NAMES[p.kind]}`;
      card.querySelector('.c-desc')!.textContent = `A ${poiDirection(this.sim, p)}. ${p.done ? 'Cumprido.' : POI_HINTS[p.kind]}`;
      card.onclick = () => {
        this.goTo(p.tx, p.ty);
        this.close();
      };
      list.appendChild(card);
    }
    this.body.appendChild(list);
    const read = readLore(this.sim);
    const h = document.createElement('h3');
    h.className = 'lore-head';
    h.textContent = `Fragmentos de história (${read.length}/${LORE.length})`;
    this.body.appendChild(h);
    if (!read.length) {
      const none = document.createElement('p');
      none.className = 'muted';
      none.textContent = 'Nenhum ainda. Procure os locais de história fora dos muros.';
      this.body.appendChild(none);
    }
    for (const i of read) {
      const f = LORE[i];
      const box = document.createElement('div');
      box.className = 'lore';
      box.innerHTML = '<div class="lore-title"></div><div class="lore-text"></div>';
      box.querySelector('.lore-title')!.textContent = f.title;
      box.querySelector('.lore-text')!.textContent = f.text;
      this.body.appendChild(box);
    }
  }
}

import { CHRONICLES, CHRONICLE_IDS } from '../data/chronicles';
import type { Sim } from '../core/sim';
import { ERA_NAMES, eraMilestones } from '../systems/era';
import { EVENT_DEFS, resolveEvent } from '../systems/events';

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
    btn.disabled = true;
    const all = ms.every((m) => m.done);
    btn.textContent = all ? 'Avançar para a Era II (em breve)' : 'Avançar para a Era II';
    btn.title = 'A Era II chega numa próxima atualização do jogo.';
    this.body.appendChild(btn);
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = 'A Era II — Vila (muros de pedra, quartel, arqueiros, cadeias de produção) está sendo construída e chega numa próxima atualização. Seu progresso fica guardado.';
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

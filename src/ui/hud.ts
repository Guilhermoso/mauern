import { BALANCE } from '../data/balance';
import { formatClock, getClock } from '../core/time';
import { populationCap, type GameState } from '../state';
import type { ResourceKind } from '../entities/types';

export interface HudActions {
  setSpeed(speed: number): void;
  openMenu(): void;
  selectIdle(): void;
}

const RESOURCES: { key: ResourceKind; label: string; color: string }[] = [
  { key: 'food', label: 'Comida', color: '#d2553f' },
  { key: 'wood', label: 'Madeira', color: '#9a6a3a' },
  { key: 'stone', label: 'Pedra', color: '#a9a49a' },
  { key: 'iron', label: 'Ferro', color: '#6d7f8c' },
  { key: 'gold', label: 'Ouro', color: '#e0b43c' },
];

// Barra superior, diário de eventos e notificações. O texto é atualizado algumas vezes por segundo.
export class Hud {
  readonly topbar = document.createElement('div');
  readonly log = document.createElement('div');
  readonly toasts = document.createElement('div');
  private resEls = new Map<ResourceKind, HTMLElement>();
  private popEl!: HTMLElement;
  private idleBtn = document.createElement('button');
  private seasonEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private threatEl = document.createElement('div');
  readonly paused = document.createElement('div');
  private speedBtns: HTMLButtonElement[] = [];
  private lastLogLength = -1;
  private lastLogTick = -1;
  private lastSpeed = -1;

  constructor(private actions: HudActions) {
    this.topbar.className = 'topbar panel';
    for (const r of RESOURCES) {
      const el = document.createElement('div');
      el.className = 'res';
      el.title = r.label;
      el.innerHTML = `<span class="chip" style="background:${r.color}"></span><span class="label">${r.label}</span><b>0</b>`;
      this.topbar.appendChild(el);
      this.resEls.set(r.key, el.querySelector('b')!);
    }
    const pop = document.createElement('div');
    pop.className = 'res';
    pop.title = 'População / limite';
    pop.innerHTML = `<span class="chip" style="background:#3a6fd8"></span><span class="label">População</span><b>0</b>`;
    this.popEl = pop.querySelector('b')!;
    this.topbar.appendChild(pop);

    this.idleBtn.className = 'idle-btn';
    this.idleBtn.title = 'Selecionar o próximo aldeão ocioso (tecla .)';
    this.idleBtn.onclick = () => this.actions.selectIdle();
    this.topbar.appendChild(this.idleBtn);

    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    this.topbar.appendChild(spacer);

    const era = document.createElement('div');
    era.className = 'era';
    era.textContent = 'Era I — Refúgio';
    this.seasonEl = document.createElement('div');
    this.clockEl = document.createElement('div');
    this.clockEl.className = 'clock';
    this.threatEl.className = 'threat';
    this.threatEl.title = 'Próximo Grande Ataque de titãs';
    this.topbar.append(era, this.threatEl, this.seasonEl, this.clockEl);
    this.paused.className = 'paused panel hidden';
    this.paused.textContent = 'PAUSADO — Espaço para continuar';

    const speeds = document.createElement('div');
    speeds.className = 'speeds';
    for (const s of BALANCE.speeds) {
      const b = document.createElement('button');
      b.textContent = s === 0 ? '❚❚' : `${s}x`;
      b.title = s === 0 ? 'Pausar (Espaço)' : `Velocidade ${s}x`;
      b.dataset.speed = String(s);
      b.onclick = () => this.actions.setSpeed(s);
      speeds.appendChild(b);
      this.speedBtns.push(b);
    }
    this.topbar.appendChild(speeds);

    const menu = document.createElement('button');
    menu.textContent = 'Menu';
    menu.title = 'Menu (Esc)';
    menu.onclick = () => this.actions.openMenu();
    this.topbar.appendChild(menu);

    this.log.className = 'log panel';
    this.toasts.className = 'toasts';
  }

  update(state: GameState): void {
    for (const r of RESOURCES) this.resEls.get(r.key)!.textContent = String(Math.floor(state.resources[r.key]));
    this.popEl.textContent = `${state.units.length}/${populationCap(state)}`;
    const idle = state.units.filter((u) => u.kind === 'villager' && u.order.type === 'idle').length;
    this.idleBtn.textContent = `Ociosos: ${idle}`;
    this.idleBtn.classList.toggle('has-idle', idle > 0);
    const clock = getClock(state.tick);
    this.seasonEl.textContent = `${clock.season}, ano ${clock.year}`;
    this.clockEl.textContent = `Dia ${clock.day} · ${formatClock(clock)}`;

    const th = state.threat;
    this.threatEl.textContent = th.greatAttackAnnounced ? 'Grande Ataque amanhã!' : `Grande Ataque: dia ${th.nextGreatAttackDay}`;
    this.threatEl.classList.toggle('soon', th.greatAttackAnnounced || th.nextGreatAttackDay === clock.day);
    if (th.nextGreatAttackDay === clock.day) this.threatEl.textContent = 'Grande Ataque hoje!';

    if (state.speed !== this.lastSpeed) {
      this.lastSpeed = state.speed;
      for (const b of this.speedBtns) b.classList.toggle('active', Number(b.dataset.speed) === state.speed);
    }

    const last = state.log[state.log.length - 1];
    if (state.log.length !== this.lastLogLength || last?.tick !== this.lastLogTick) {
      this.lastLogLength = state.log.length;
      this.lastLogTick = last?.tick ?? -1;
      this.renderLog(state);
    }
  }

  private renderLog(state: GameState): void {
    this.log.innerHTML = '';
    for (const entry of state.log.slice(-40)) {
      const c = getClock(entry.tick);
      const div = document.createElement('div');
      div.className = 'entry';
      const when = document.createElement('span');
      when.className = 'when';
      when.textContent = `D${c.day} ${formatClock(c)}`;
      div.append(when, document.createTextNode(entry.text));
      this.log.appendChild(div);
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  setPaused(paused: boolean): void {
    this.paused.classList.toggle('hidden', !paused);
  }

  // Notificação passageira. Com onClick, clicar nela leva a câmera ao local do evento.
  toast(text: string, onClick?: () => void, danger = false): void {
    const t = document.createElement('div');
    t.className = 'toast panel';
    if (danger) t.classList.add('danger');
    t.textContent = text;
    if (onClick) {
      t.classList.add('clickable');
      t.title = 'Clique para ver';
      t.onclick = () => {
        onClick();
        t.remove();
      };
    }
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
    setTimeout(() => t.remove(), 5000);
  }
}

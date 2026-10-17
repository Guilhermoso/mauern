import { BALANCE } from '../data/balance';
import { formatClock, getClock } from '../core/time';
import { populationCap, type GameState } from '../state';
import type { Sim } from '../core/sim';
import { foodPerDay, moraleTarget, taxesPerDay, winterWoodPerDay } from '../systems/city';
import { ERA_NAMES } from '../systems/era';
import type { ResourceKind } from '../entities/types';
import { NODE_DEFS } from '../data/defs';
import { cmdIconImg } from './cmdIcons';

export interface HudActions {
  setSpeed(speed: number): void;
  openMenu(): void;
  selectIdle(): void;
  openEra(): void;
  openChronicles(): void;
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
  readonly resPanel = document.createElement('div'); // recursos ao lado do minimapa (estilo AoE3)
  private gathererEls = new Map<ResourceKind, HTMLElement>();
  readonly log = document.createElement('div');
  readonly toasts = document.createElement('div');
  private resEls = new Map<ResourceKind, HTMLElement>();
  private popEl!: HTMLElement;
  private idleBtn = document.createElement('button');
  private moraleEl = document.createElement('div');
  private eraBtn = document.createElement('button');
  private resWrap = new Map<ResourceKind, HTMLElement>();
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
    // Painel de recursos: [aldeões coletando] [ícone] [quantidade]
    this.resPanel.className = 'respanel panel';
    const pop = document.createElement('div');
    pop.className = 'res-row pop';
    pop.title = 'População / limite (construa casas para aumentar)';
    pop.append(cmdIconImg('res-pop', 'res-icon'));
    this.popEl = document.createElement('b');
    this.popEl.className = 'res-amount';
    pop.append(this.popEl);
    this.resPanel.appendChild(pop);
    for (const r of RESOURCES) {
      const row = document.createElement('div');
      row.className = 'res-row';
      row.title = r.label;
      const count = document.createElement('span');
      count.className = 'res-gatherers';
      count.textContent = '0';
      const amount = document.createElement('b');
      amount.className = 'res-amount';
      row.append(count, cmdIconImg(`res-${r.key}`, 'res-icon'), amount);
      this.resPanel.appendChild(row);
      this.resEls.set(r.key, amount);
      this.resWrap.set(r.key, row);
      this.gathererEls.set(r.key, count);
    }

    this.moraleEl.className = 'morale';
    this.topbar.appendChild(this.moraleEl);

    this.idleBtn.className = 'idle-btn';
    this.idleBtn.title = 'Selecionar o próximo aldeão ocioso (tecla .)';
    this.idleBtn.onclick = () => this.actions.selectIdle();
    this.topbar.appendChild(this.idleBtn);

    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    this.topbar.appendChild(spacer);

    const era = this.eraBtn;
    era.className = 'era-link';
    era.title = 'Caminho para a próxima era';
    era.onclick = () => this.actions.openEra();
    const chron = document.createElement('button');
    chron.className = 'chron-link';
    chron.textContent = 'Crônicas';
    chron.title = 'Objetivos opcionais e relíquias';
    chron.onclick = () => this.actions.openChronicles();
    this.seasonEl = document.createElement('div');
    this.clockEl = document.createElement('div');
    this.clockEl.className = 'clock';
    this.threatEl.className = 'threat';
    this.threatEl.title = 'Próximo Grande Ataque: uma horda de titãs, anunciada na véspera';
    this.topbar.append(era, chron, this.threatEl, this.seasonEl, this.clockEl);
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

  update(sim: Sim): void {
    const state = sim.state;
    for (const r of RESOURCES) this.resEls.get(r.key)!.textContent = String(Math.floor(state.resources[r.key]));
    // Aldeões trabalhando em cada recurso (fazendeiros contam como comida).
    const working: Record<ResourceKind, number> = { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };
    for (const u of state.units) {
      if (u.order.type === 'farm') working.food++;
      else if (u.order.type === 'gather') working[NODE_DEFS[u.order.nodeKind].resource]++;
    }
    for (const r of RESOURCES) this.gathererEls.get(r.key)!.textContent = String(working[r.key]);
    this.eraBtn.textContent = ERA_NAMES[state.era];
    // Dicas com consumo e produção.
    const fpd = foodPerDay(sim);
    this.resWrap.get('food')!.title = `Comida — a população consome ${fpd.toFixed(0)} por dia${state.city.starving ? ' (FALTANDO!)' : ''}`;
    const wpd = winterWoodPerDay(sim);
    this.resWrap.get('wood')!.title = `Madeira — no inverno as casas queimam ${wpd.toFixed(0)} por dia${state.city.cold ? ' (FALTANDO!)' : ''}`;
    this.resWrap.get('gold')!.title = `Ouro — impostos: ${taxesPerDay(sim).toFixed(1)} por dia (casas melhores pagam mais)`;
    const mt = moraleTarget(sim);
    const m = Math.round(state.morale);
    this.moraleEl.textContent = `Moral ${m}${mt.target > m + 1 ? ' ▲' : mt.target < m - 1 ? ' ▼' : ''}`;
    this.moraleEl.classList.toggle('low', m < 35);
    this.moraleEl.classList.toggle('high', m >= 70);
    this.moraleEl.title =
      `Moral ${m} (tende a ${mt.target})\n` +
      mt.parts.map((p) => `${p.value >= 0 ? '+' : ''}${p.value}  ${p.label}`).join('\n') +
      `\n\nMoral alta faz todos trabalharem mais rápido.`;
    this.popEl.textContent = `${state.units.length}/${populationCap(state)}`;
    const idle = state.units.filter((u) => u.kind === 'villager' && u.order.type === 'idle').length;
    this.idleBtn.textContent = `Ociosos: ${idle}`;
    this.idleBtn.classList.toggle('has-idle', idle > 0);
    const clock = getClock(state.tick);
    this.seasonEl.textContent = clock.season;
    this.seasonEl.title = `${clock.season}, ano ${clock.year}`;
    this.clockEl.textContent = `Dia ${clock.day} · ${formatClock(clock)}`;

    const th = state.threat;
    this.threatEl.textContent = th.greatAttackAnnounced ? 'Horda amanhã!' : `Horda: dia ${th.nextGreatAttackDay}`;
    this.threatEl.classList.toggle('soon', th.greatAttackAnnounced || th.nextGreatAttackDay === clock.day);
    if (th.nextGreatAttackDay === clock.day) this.threatEl.textContent = 'Horda hoje!';

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
  toast(text: string, onClick?: () => void, danger = false, good = false): void {
    const t = document.createElement('div');
    t.className = 'toast panel';
    if (danger) t.classList.add('danger');
    if (good) t.classList.add('good');
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

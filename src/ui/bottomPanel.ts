import { BUILDING_DEFS, NODE_DEFS, RESOURCE_NAMES, UNIT_DEFS, VILLAGER_BUILDS, formatCost, unitNoun } from '../data/defs';
import { isFemaleName } from '../entities/names';
import { iconImg } from './icons';
import { batchTime } from '../systems/production';
import type { Sim } from '../core/sim';
import type { SelectionController } from '../input/selection';
import { populationCap } from '../state';
import { canAfford, cancelTrain, trainUnit } from '../systems/commands';
import { dismissGuard, guardOf, releaseShelter } from '../systems/refuge';
import { unitStatus } from '../systems/units';
import { garrisonCount } from '../systems/damage';
import { ringAlarm, stopAlarm } from '../systems/combat';
import { availableTechs, cancelResearch, startResearch } from '../systems/research';
import { TECH_DEFS, type TechId } from '../data/techs';
import { BALANCE } from '../data/balance';
import { missingNeeds, serviceRadius } from '../systems/city';
import { buildingMaxHp, unitMaxHp } from '../systems/modifiers';
import { housingOf } from '../state';
import { rankName, xpToNext, MAX_LEVEL } from '../data/ranks';
import { isSoldier, setTrainer, trainees, trainer, trainingRate, dismissTraining } from '../systems/soldiers';
import { battalionCapacity, battalionOf, battalionUnits, disbandBattalion, setCommander, setMode } from '../systems/battalions';
import { unitAttack } from '../systems/modifiers';
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
    if (s.battalions.length === 1 && !s.units.length) {
      const b = battalionOf(this.sim, s.battalions[0]);
      return b ? `bat:${b.id}:${b.commanderId}:${b.memberIds.join(',')}:${b.mode}` : '';
    }
    if (s.battalions.length) return `bats:${s.battalions.join(',')}:${s.units.join(',')}`;
    if (s.units.length) {
      const one = s.units.length === 1 ? this.sim.unit(s.units[0])?.kind : '';
      return `u:${s.units.join(',')}:${one}`;
    }
    if (s.building !== null) {
      const b = this.sim.building(s.building);
      return b
        ? `b:${b.id}:${b.built}:${b.queue.map((q) => q.count).join('.')}:${garrisonCount(this.sim, b) > 0}:${this.sim.state.alarm}:${b.research?.tech ?? ''}:${this.sim.state.techs.length}:${b.level}:${b.trainerId}:${b.guardId}:${b.kind === 'trainingGround' ? trainees(this.sim, b).map((u) => u.id).join(',') : ''}`
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
    if (s.battalions.length === 1 && !s.units.length) this.buildBattalion(s.battalions[0]);
    else if (s.battalions.length) this.buildMixed(s.battalions, s.units);
    else if (s.units.length) this.buildUnits(s.units);
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
      const title = el('div', 'bp-title with-portrait', u.name);
      title.prepend(iconImg(u.kind, 'portrait'));
      const sub = el('div', 'bp-sub', unitNoun(u.kind, isFemaleName(u.name)));
      const hp = el('div', 'bp-line');
      const status = el('div', 'bp-line');
      this.info.append(title, sub);
      if (isSoldier(u)) this.soldierLines(u);
      this.info.append(hp, status);
      this.updaters.push(() => {
        hp.textContent = `Vida: ${Math.ceil(u.hp)}/${unitMaxHp(this.sim.state, u)}`;
        status.textContent = unitStatus(this.sim, u);
      });
    } else {
      const counts = new Map<UnitKind, number>();
      for (const u of units) counts.set(u.kind, (counts.get(u.kind) ?? 0) + 1);
      this.info.append(el('div', 'bp-title', `${units.length} unidades`));
      for (const [kind, n] of counts) {
        const row = el('div', 'bp-line with-icon-line', `${n}× ${UNIT_DEFS[kind].name}`);
        row.prepend(iconImg(kind, 'mini-icon'));
        this.info.append(row);
      }
    }

    this.info.append(el('div', 'bp-hint', 'Clique direito: andar, coletar, construir, reparar, abrigar, treinar ou atacar.'));
    if (units.some((u) => isSoldier(u))) {
      this.commands.appendChild(
        cmdButton('Formar batalhão', 'o de maior nível comanda', 'B', 'Junta os soldados selecionados num batalhão: andam e lutam juntos.', () =>
          this.sel.formBattalionFromSelection(),
        ),
      );
    }
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
    if (b.kind === 'trainingGround') this.buildTrainingGround(b);
    if (b.kind === 'well' || b.kind === 'bonfire') {
      this.info.append(el('div', 'bp-line', `Alcance: ${serviceRadius(this.sim, b.kind)} tiles (círculo no mapa)`));
    }
    this.buildResearch(b);
    if (def.garrison > 0) this.buildShelter(b);
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
      const batch = udef.military ? BALANCE.units.maxBatch : 1;
      const tip = udef.military
        ? `${udef.name} (${udef.trainTime}s). Treina em lotes de até ${batch}: cada clique soma 1 ao lote; Shift+clique (ou Shift+${key}) enfileira um lote cheio.`
        : `${udef.name} (${udef.trainTime}s). Shift+${key} enfileira 5.`;
      const btn = cmdButton(`Treinar ${udef.name.toLowerCase()}`, formatCost(udef.cost), key, tip, () => {});
      btn.onclick = (ev) => {
        const shift = ev.shiftKey;
        const times = shift && !udef.military ? 5 : 1;
        for (let i = 0; i < times; i++) {
          const err = trainUnit(this.sim, b.id, kind, shift && udef.military);
          if (err) {
            this.toast(err);
            break;
          }
        }
      };
      btn.classList.add('with-icon');
      btn.prepend(iconImg(kind, 'cmd-icon'));
      this.commands.appendChild(btn);
      this.updaters.push(() => btn.classList.toggle('disabled', !canAfford(this.sim, udef.cost)));
    }

    if (def.trains.length) {
      const queue = el('div', 'bp-queue');
      b.queue.forEach((item, i) => {
        // Ícone da unidade; no lote em treino, uma "pizza" escura recua no sentido horário.
        const q = document.createElement('button');
        q.className = 'bp-qitem';
        q.title = `${item.count}× ${UNIT_DEFS[item.kind].name} — clique para cancelar uma`;
        q.appendChild(iconImg(item.kind, 'q-icon'));
        const pie = el('div', 'q-pie');
        q.appendChild(pie);
        if (item.count > 1) q.appendChild(el('div', 'q-count', `×${item.count}`));
        q.onclick = () => cancelTrain(this.sim, b.id, i);
        if (i === 0) {
          this.updaters.push(() => {
            const p = Math.min(100, (item.progress / batchTime(item.kind, item.count)) * 100);
            pie.style.background = `conic-gradient(transparent 0 ${p}%, rgba(0, 0, 0, 0.6) ${p}% 100%)`;
          });
        } else {
          pie.style.background = 'rgba(0, 0, 0, 0.35)';
        }
        queue.appendChild(q);
      });
      const pop = el('div', 'bp-line');
      this.info.append(queue, pop);
      this.updaters.push(() => {
        const cap = populationCap(this.sim.state);
        const n = this.sim.state.units.length;
        const need = b.queue[0]?.count ?? 0;
        pop.textContent = need && n + need > cap ? `Sem moradia para o lote (${n}/${cap}) — construa casas!` : '';
        pop.classList.toggle('warn', !!need && n + need > cap);
      });
      this.info.append(el('div', 'bp-hint', 'Botão direito no mapa define o ponto de reunião.'));
    }
    if (b.kind !== 'townCenter') this.commands.appendChild(dangerButton('Demolir', 'Del', () => this.sel.deleteSelected()));
  }

  // Patente, nível, barra de experiência e força do soldado.
  private soldierLines(u: Unit): void {
    const rank = el('div', 'bp-rank');
    const bar = progressBar();
    const stats = el('div', 'bp-line');
    this.info.append(rank, bar.el, stats);
    this.updaters.push(() => {
      rank.textContent = `${rankName(u.level)} · nível ${u.level}`;
      const need = xpToNext(u.level);
      bar.set(u.level >= MAX_LEVEL ? 1 : u.xp / need);
      bar.el.title = u.level >= MAX_LEVEL ? 'Nível máximo' : `Experiência: ${Math.floor(u.xp)}/${need}`;
      stats.textContent = `Ataque ${unitAttack(this.sim.state, u).toFixed(1).replace('.', ',')}`;
    });
  }

  private buildBattalion(id: number): void {
    const b = battalionOf(this.sim, id);
    if (!b) return;
    const c = this.sim.unit(b.commanderId);
    this.info.append(el('div', 'bp-title', b.name));
    if (c) {
      this.info.append(el('div', 'bp-sub', `Comandante: ${c.name}`));
      this.soldierLines(c);
    }
    const size = el('div', 'bp-line');
    const status = el('div', 'bp-line');
    this.info.append(size, status);
    this.updaters.push(() => {
      const cmd = this.sim.unit(b.commanderId);
      size.textContent = `Soldados: ${b.memberIds.length}/${cmd ? battalionCapacity(cmd.level) : 0} (+ comandante)`;
      const o = b.order;
      const modeText = { manual: 'Sob seu comando', defend: 'Defendendo a posição', hunt: 'Caçando titãs' }[b.mode];
      status.textContent = `${modeText} — ${o.type === 'attack' ? 'em combate' : o.type === 'move' ? 'em marcha' : 'parado'}`;
    });
    this.info.append(el('div', 'bp-hint', 'Clique direito: mover ou atacar (volta ao modo manual). Subir o comandante de nível abre mais vagas.'));

    const modes: [typeof b.mode, string, string, string][] = [
      ['manual', 'Manual', 'você comanda', 'O batalhão só age quando você manda (mas revida titãs por perto).'],
      ['defend', 'Defender aqui', 'protege este ponto', 'Guarda a posição atual e ataca titãs que se aproximarem.'],
      ['hunt', 'Caçar titãs', 'patrulha o mapa', 'Sai pelo mapa procurando titãs para abater.'],
    ];
    for (const [mode, label, cost, title] of modes) {
      const btn = cmdButton(label, cost, '', title, () => setMode(this.sim, b.id, mode));
      if (b.mode === mode) btn.classList.add('active-mode');
      this.commands.appendChild(btn);
    }
    this.commands.appendChild(dangerButton('Desfazer batalhão', '', () => disbandBattalion(this.sim, b.id)));

    // Membros: clicar torna comandante.
    const list = el('div', 'bp-members wide');
    list.appendChild(el('div', 'bp-sub', 'Membros (clique para tornar comandante):'));
    for (const u of battalionUnits(this.sim, b)) {
      const row = document.createElement('button');
      row.className = `bp-member ${u.id === b.commanderId ? 'commander' : ''}`;
      row.textContent = `${u.id === b.commanderId ? '★ ' : ''}${u.name} — ${rankName(u.level)}`;
      row.title = u.id === b.commanderId ? 'Comandante' : 'Clique para tornar comandante';
      if (u.id !== b.commanderId) row.onclick = () => setCommander(this.sim, b.id, u.id);
      list.appendChild(row);
    }
    this.commands.append(list);
  }

  private buildMixed(battalions: number[], units: number[]): void {
    this.info.append(el('div', 'bp-title', `${battalions.length} batalhão(ões)${units.length ? ` + ${units.length} unidade(s)` : ''}`));
    for (const id of battalions) {
      const b = battalionOf(this.sim, id);
      if (b) this.info.append(el('div', 'bp-line', `${b.name}: ${b.memberIds.length + 1} soldados`));
    }
    this.info.append(el('div', 'bp-hint', 'Clique direito: todos se movem ou atacam juntos.'));
    this.commands.appendChild(cmdButton('Parar', '', '', 'Interrompe a ordem atual', () => this.sel.stopSelected()));
  }

  // Abrigos (Centro da Vila, torres, Campo de Refúgio): quem está dentro, terror e como liberar.
  private buildShelter(b: Building): void {
    const def = BUILDING_DEFS[b.kind];
    const line = el('div', 'bp-line');
    const terror = el('div', 'bp-line warn');
    this.info.append(line, terror);
    const inside = () => this.sim.state.units.filter((u) => u.garrison === b.id);
    this.updaters.push(() => {
      const list = inside();
      line.textContent = `Abrigados: ${list.length}/${def.garrison}`;
      const scared = list.filter((u) => u.terror > 0);
      const longest = Math.max(0, ...scared.map((u) => u.terror));
      terror.textContent = scared.length ? `${scared.length} aterrorizado(s) — não saem por mais ${Math.ceil(longest)} s` : '';
    });
    if (b.kind === 'refuge') {
      const guard = el('div', 'bp-line');
      this.info.append(guard);
      this.updaters.push(() => {
        const g = guardOf(this.sim, b);
        guard.textContent = g
          ? `Guarda no posto: ${g.name} — ${rankName(g.level)} (terror passa ${Math.round(g.level * BALANCE.refuge.guardBonusPerLevel * 100)}% mais rápido)`
          : 'Sem guarda: mande um soldado para cá (botão direito) para acalmar os aldeões.';
      });
      if (guardOf(this.sim, b)) this.commands.appendChild(cmdButton('Dispensar guarda', '', '', 'O soldado deixa o posto', () => dismissGuard(this.sim, b.id)));
    }
    if (garrisonCount(this.sim, b) > 0) {
      this.commands.appendChild(
        cmdButton('Sair', 'ficam ociosos', 'U', 'Os abrigados que não estão aterrorizados saem do edifício.', () => {
          if (releaseShelter(this.sim, b.id, false) === 0) this.toast('Ninguém pode sair agora (aterrorizados ou ninguém dentro).');
        }),
      );
      this.commands.appendChild(
        cmdButton('Voltar ao trabalho', 'retomam o que faziam', '', 'Os abrigados que não estão aterrorizados saem e voltam ao que faziam antes de fugir.', () => {
          if (releaseShelter(this.sim, b.id, true) === 0) this.toast('Ninguém pode sair agora (aterrorizados ou ninguém dentro).');
        }),
      );
    }
  }

  private buildTrainingGround(b: Building): void {
    const S = BALANCE.soldiers;
    const t = trainer(this.sim, b);
    const coach = el('div', 'bp-line');
    const rate = el('div', 'bp-line');
    this.info.append(coach, rate);
    this.updaters.push(() => {
      const tr = trainer(this.sim, b);
      const list = trainees(this.sim, b).filter((u) => u !== tr);
      coach.textContent = tr ? `Treinador: ${tr.name} — ${rankName(tr.level)}` : 'Sem treinador: escolha um soldado abaixo.';
      coach.classList.toggle('warn', !tr);
      const avg = list.length ? list.reduce((n, u) => n + trainingRate(tr, u), 0) / list.length : 0;
      rate.textContent = `Alunos: ${list.length}/${S.trainingCapacity}${tr ? ` · ${avg.toFixed(1).replace('.', ',')} XP/s cada` : ''}`;
    });
    this.info.append(el('div', 'bp-hint', 'Mande soldados para cá com o botão direito. Alunos que já alcançaram o nível do treinador aprendem bem mais devagar.'));
    const list = el('div', 'bp-members wide');
    if (trainees(this.sim, b).length) list.appendChild(el('div', 'bp-sub', 'No campo (clique para tornar treinador):'));
    for (const u of trainees(this.sim, b)) {
      const row = document.createElement('button');
      const isCoach = t?.id === u.id;
      row.className = `bp-member ${isCoach ? 'commander' : ''}`;
      row.textContent = `${isCoach ? '★ ' : ''}${u.name} — ${rankName(u.level)}`;
      row.title = isCoach ? 'Treinador' : 'Clique para tornar treinador';
      if (!isCoach) row.onclick = () => {
        const err = setTrainer(this.sim, b.id, u.id);
        if (err) this.toast(err);
      };
      list.appendChild(row);
    }
    if (trainees(this.sim, b).length) this.commands.appendChild(dangerButton('Dispensar todos', '', () => dismissTraining(this.sim, b.id)));
    this.commands.append(list);
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

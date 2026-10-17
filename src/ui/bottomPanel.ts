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
import { battalionCapacity, battalionOf, battalionUnits, canChooseFormation, disbandBattalion, setAutoHospital, setCommander, setFormation, setMode, toggleCritical } from '../systems/battalions';
import { canEnnoble, ennoble } from '../systems/nobility';
import { dismissDoctors, doctors, hospitalBeds, patients, startHospitalUpgrade, upgradeCost, upgradeTime } from '../systems/hospital';
import { auraBonus, buffFraction, honorBonus, honors, isLegend, leadershipBonus, shieldInfo, unitAttack } from '../systems/modifiers';
import type { Building, Formation, Unit, UnitKind } from '../entities/types';

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
      if (!b) return '';
      const titles = battalionUnits(this.sim, b).map((u) => `${u.noble ? 'n' : ''}${canEnnoble(u) ? 'e' : ''}`).join('');
      return `bat:${b.id}:${b.commanderId}:${b.memberIds.join(',')}:${b.mode}:${b.autoHospital}:${b.formation}:${canChooseFormation(this.sim, b)}:${titles}`;
    }
    if (s.battalions.length) return `bats:${s.battalions.join(',')}:${s.units.join(',')}`;
    if (s.units.length) {
      const u1 = s.units.length === 1 ? this.sim.unit(s.units[0]) : undefined;
      const one = u1 ? `${u1.kind}:${u1.noble}:${canEnnoble(u1)}` : '';
      return `u:${s.units.join(',')}:${one}`;
    }
    if (s.building !== null) {
      const b = this.sim.building(s.building);
      return b
        ? `b:${b.id}:${b.built}:${b.queue.map((q) => q.count).join('.')}:${garrisonCount(this.sim, b) > 0}:${this.sim.state.alarm}:${b.research?.tech ?? ''}:${this.sim.state.techs.length}:${b.level}:${b.trainerId}:${b.guardId}:${b.doctorIds.length}:${b.upgradeProgress >= 0}:${b.kind === 'hospital' ? patients(this.sim, b).map((u) => u.id).join(',') : ''}:${b.kind === 'trainingGround' ? trainees(this.sim, b).map((u) => u.id).join(',') : ''}`
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
      if (this.sim.intimidated.has(t.id)) status.textContent += ' — intimidado por uma lenda (-5% de vida, -10% de dano)';
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
    if (units.length === 1 && canEnnoble(units[0])) this.commands.appendChild(this.ennobleButton(units[0]));
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
    if (b.kind === 'hospital') this.buildHospital(b);
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
    const glory = el('div', 'bp-line bp-lead');
    this.info.append(rank, bar.el, stats, glory);
    this.updaters.push(() => {
      const f = isFemaleName(u.name);
      const titles = [u.noble ? (f ? 'Nobre dama' : 'Nobre cavaleiro') : '', isLegend(u) ? 'Lenda' : ''].filter(Boolean).join(' · ');
      rank.textContent = `${titles ? `${titles} — ` : ''}${rankName(u.level)} · nível ${u.level}`;
      const st = this.sim.state;
      const n = honors(u);
      const parts = [`Honras: ${n}/${BALANCE.honor.max}${n ? ` (+${pct(honorBonus(u))})` : ''} · ${u.kills} titãs`];
      const total = buffFraction(st, u);
      if (total > 0) parts.push(`Bônus total: +${pct(total)}`);
      const sh = shieldInfo(st, u);
      if (sh.max > 0) parts.push(`Escudo: ${Math.ceil(u.shield)}/${sh.max}`);
      glory.textContent = parts.join(' · ');
      const a = auraBonus(st, u);
      glory.title = [
        `Comando: +${pct(leadershipBonus(st, u))}`,
        `Aura de nobre: +${pct(a.noble)}`,
        `Aura de lenda: +${pct(a.legend)}`,
        `Honras: +${pct(honorBonus(u))}`,
        'Os bônus se somam sobre a vida e o ataque base.',
      ].join('\n');
      const need = xpToNext(u.level);
      bar.set(u.level >= MAX_LEVEL ? 1 : u.xp / need);
      bar.el.title = u.level >= MAX_LEVEL ? 'Nível máximo' : `Experiência: ${Math.floor(u.xp)}/${need}`;
      stats.textContent = `Ataque ${unitAttack(this.sim.state, u).toFixed(1).replace('.', ',')}`;
    });
  }

  // Conceder título de nobreza (nível 70+): 500 de ouro e soldo diário.
  private ennobleButton(u: Unit): HTMLButtonElement {
    const N = BALANCE.nobility;
    const btn = cmdButton(
      `Nobreza: ${u.name.split(' ')[0]}`,
      `${formatCost(N.cost)} + ${N.upkeepGold} ouro/dia`,
      '',
      `Título de nobreza para ${u.name}: monta a cavalo com lança dourada (+${N.lanceDamage} de dano base, +${N.extraHp} de vida base). ` +
        `Como comandante, +${N.leadershipBonus * 100}% no bônus de comando (e o recebe também); o batalhão anda ${N.battalionSpeed * 100}% mais rápido. ` +
        `Militares por perto recebem +${N.auraBonus * 100}% de vida e ataque. Prioridade no hospital. Como treinador, +${N.trainerXp} de experiência por segundo. ` +
        `Se morrer, a moral cai muito.`,
      () => {
        const err = ennoble(this.sim, u.id);
        if (err) this.toast(err);
      },
    );
    this.updaters.push(() => btn.classList.toggle('disabled', !canAfford(this.sim, N.cost)));
    return btn;
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
    const lead = el('div', 'bp-line bp-lead');
    const size = el('div', 'bp-line');
    const status = el('div', 'bp-line');
    this.info.append(lead, size, status);
    this.updaters.push(() => {
      const cmd = this.sim.unit(b.commanderId);
      const S = BALANCE.soldiers;
      const bonus = cmd ? cmd.level * S.leadershipPerLevel + (cmd.noble ? BALANCE.nobility.leadershipBonus : 0) : 0;
      const near = b.memberIds.filter((id) => {
        const m = this.sim.unit(id);
        return m && leadershipBonus(this.sim.state, m) > 0;
      }).length;
      lead.textContent = `Liderança: +${pct(bonus)} ataque e vida (${near}/${b.memberIds.length} perto do comandante)${cmd?.noble ? ' · nobre: vale para si e +5% de velocidade' : ''}`;
      lead.title = `Soldados a até ${S.leadershipRadius} tiles do comandante recebem +${S.leadershipPerLevel * 100}% por nível dele (comandante nobre: +${BALANCE.nobility.leadershipBonus * 100}% fixo).`;
      size.textContent = `Soldados: ${b.memberIds.length}/${cmd ? battalionCapacity(cmd.level) : 0} (+ comandante)`;
      const o = b.order;
      const modeText = { manual: 'Sob seu comando', defend: 'Defendendo a posição', hunt: 'Caçando titãs' }[b.mode];
      if (b.inHospital) status.textContent = 'Internado no hospital';
      else if (o.type === 'hospital') status.textContent = 'Recuando para o hospital';
      else status.textContent = `${modeText} — ${o.type === 'attack' ? 'em combate' : o.type === 'move' ? 'em marcha' : 'parado'}`;
      status.classList.toggle('warn', !!b.inHospital || o.type === 'hospital');
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

    // Hospital automático em estado crítico.
    const auto = cmdButton(
      b.autoHospital ? 'Hospital: automático' : 'Hospital: desligado',
      b.autoHospital ? 'recua em estado crítico' : 'luta até o fim',
      '',
      `Quando uma unidade marcada com ✚ ficar abaixo de ${Math.round(BALANCE.hospital.criticalHp * 100)}% de vida, o batalhão corre para um hospital com leitos para todos.`,
      () => setAutoHospital(this.sim, b.id, !b.autoHospital),
    );
    if (b.autoHospital) auto.classList.add('active-mode');
    this.commands.appendChild(auto);

    // Formações (comandante a partir do nível 40).
    const unlocked = canChooseFormation(this.sim, b);
    const lvl = BALANCE.soldiers.formationUnlockLevel;
    const formations: [Formation, string, string][] = [
      ['block', 'Bloco', 'Fileiras compactas atrás do comandante.'],
      ['line', 'Linha', 'Todos lado a lado: uma frente larga.'],
      ['column', 'Coluna', 'Em fila indiana: passa por corredores estreitos.'],
      ['wedge', 'Cunha', 'Um "V" com o comandante na ponta.'],
      ['circle', 'Círculo', 'Um anel protegendo o comandante.'],
    ];
    for (const [f, label, title] of formations) {
      const btn = cmdButton(label, unlocked ? 'formação' : `comandante nível ${lvl}`, '', unlocked ? title : `${title} Libera com o comandante no nível ${lvl}.`, () => {
        const err = setFormation(this.sim, b.id, f);
        if (err) this.toast(err);
      });
      if (!unlocked) btn.classList.add('disabled');
      else if (b.formation === f) btn.classList.add('active-mode');
      this.commands.appendChild(btn);
    }
    for (const u of battalionUnits(this.sim, b)) if (canEnnoble(u)) this.commands.appendChild(this.ennobleButton(u));

    // Membros: clicar no nome torna comandante; ✚ marca quem dispara o estado crítico.
    const list = el('div', 'bp-members wide');
    list.appendChild(el('div', 'bp-sub', 'Membros — clique no nome para tornar comandante; ✚ = dispara o estado crítico:'));
    for (const u of battalionUnits(this.sim, b)) {
      const row = el('div', 'bp-member-row');
      const crit = document.createElement('button');
      crit.className = `bp-crit ${b.criticalIds.includes(u.id) ? 'on' : ''}`;
      crit.textContent = '✚';
      crit.title = b.criticalIds.includes(u.id) ? 'Esta unidade dispara o estado crítico (clique para desmarcar)' : 'Clique para esta unidade disparar o estado crítico';
      crit.onclick = () => {
        toggleCritical(this.sim, b.id, u.id);
        crit.classList.toggle('on', b.criticalIds.includes(u.id));
      };
      const name = document.createElement('button');
      name.className = `bp-member ${u.id === b.commanderId ? 'commander' : ''}`;
      name.title = u.id === b.commanderId ? 'Comandante' : 'Clique para tornar comandante';
      if (u.id !== b.commanderId) name.onclick = () => setCommander(this.sim, b.id, u.id);
      const hpEl = el('span', 'bp-hp');
      const marks = `${u.id === b.commanderId ? '★ ' : ''}${u.noble ? '♛ ' : ''}${isLegend(u) ? '✦ ' : ''}`;
      name.append(document.createTextNode(`${marks}${u.name} — ${rankName(u.level)} `), hpEl);
      this.updaters.push(() => {
        const frac = u.hp / unitMaxHp(this.sim.state, u);
        hpEl.textContent = `${Math.round(frac * 100)}%`;
        hpEl.classList.toggle('critical', frac < BALANCE.hospital.criticalHp);
      });
      row.append(crit, name);
      list.appendChild(row);
    }
    this.commands.append(list);
  }

  private buildHospital(b: Building): void {
    const H = BALANCE.hospital;
    const beds = el('div', 'bp-line');
    const docs = el('div', 'bp-line');
    const upg = el('div', 'bp-line');
    const bar = progressBar();
    this.info.append(beds, docs, upg, bar.el);
    this.updaters.push(() => {
      beds.textContent = `Nível ${b.level} · Leitos: ${patients(this.sim, b).length}/${hospitalBeds(b)}`;
      const d = doctors(this.sim, b).length;
      docs.textContent = d ? `Médicos: ${d}/${H.maxDoctors} (cada um cura um soldado por vez)` : 'Sem médicos: mande aldeões para cá (botão direito).';
      docs.classList.toggle('warn', d === 0);
      if (b.upgradeProgress >= 0) {
        upg.textContent = `Ampliando para o nível ${b.level + 1}...`;
        bar.el.style.display = '';
        bar.set(b.upgradeProgress / upgradeTime(b));
      } else {
        upg.textContent = '';
        bar.el.style.display = 'none';
      }
    });
    this.info.append(el('div', 'bp-hint', 'Mande soldados feridos com o botão direito. Curados saem sozinhos; batalhões saem juntos quando todos sararem.'));
    if (b.level < H.maxLevel && b.upgradeProgress < 0) {
      const cost = upgradeCost(b);
      const up = cmdButton(`Ampliar (nível ${b.level + 1})`, formatCost(cost), '', `+${H.bedsPerLevel} leitos. Leva ${Math.round(upgradeTime(b))} s.`, () => {
        const err = startHospitalUpgrade(this.sim, b.id);
        if (err) this.toast(err);
      });
      this.commands.appendChild(up);
      this.updaters.push(() => up.classList.toggle('disabled', !canAfford(this.sim, cost)));
    }
    if (b.doctorIds.length) this.commands.appendChild(dangerButton('Dispensar médicos', '', () => dismissDoctors(this.sim, b.id)));
    // Pacientes com a vida de cada um.
    const list = el('div', 'bp-members wide');
    const ps = patients(this.sim, b);
    if (ps.length) list.appendChild(el('div', 'bp-sub', 'Pacientes:'));
    for (const p of ps.slice(0, 24)) {
      const row = el('div', 'bp-member');
      const hpEl = el('span', 'bp-hp');
      row.append(document.createTextNode(`${p.name} — ${rankName(p.level)} `), hpEl);
      this.updaters.push(() => (hpEl.textContent = `${Math.round((p.hp / unitMaxHp(this.sim.state, p)) * 100)}%`));
      list.appendChild(row);
    }
    if (ps.length > 24) list.appendChild(el('div', 'bp-sub', `… e mais ${ps.length - 24}`));
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

function pct(frac: number): string {
  return `${String(Math.round(frac * 1000) / 10).replace('.', ',')}%`;
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

import { BALANCE } from '../data/balance';
import { CHRONICLES } from '../data/chronicles';
import { TECH_DEFS, type TechId } from '../data/techs';
import type { Sim } from '../core/sim';
import type { Unit } from '../entities/types';
import { isFemaleName } from '../entities/names';
import { auraSources, honorBonus, honors, isLegend, leadershipBonus, shieldInfo } from './modifiers';
import { battalionOf } from './battalions';
import { trainer } from './soldiers';

// Lista de tudo que está fortalecendo um militar agora (para os ícones do painel).
// Só dados: quem desenha é a interface.

export interface BuffInfo {
  id: string;
  icon: string; // símbolo curto
  name: string;
  effect: string; // o que dá
  source: string; // de onde vem
  kind: 'gold' | 'blue' | 'green' | 'gray';
}

const pct = (f: number) => `${String(Math.round(f * 1000) / 10).replace('.', ',')}%`;

export function activeBuffs(sim: Sim, u: Unit): BuffInfo[] {
  const s = sim.state;
  const S = BALANCE.soldiers;
  const N = BALANCE.nobility;
  const L = BALANCE.legend;
  const out: BuffInfo[] = [];
  const f = isFemaleName(u.name);

  if (u.level > 1) {
    out.push({
      id: 'level', icon: '▲', name: `Experiência (nível ${u.level})`, kind: 'gray',
      effect: `+${pct(S.hpPerLevel * (u.level - 1))} de vida e +${pct(S.attackPerLevel * (u.level - 1))} de ataque base`,
      source: 'Níveis conquistados lutando e treinando',
    });
  }

  // Pesquisas e relíquias que fortalecem os milicianos.
  if (u.kind === 'militia') {
    const techs = s.techs.filter((t) => TECH_DEFS[t as TechId] && (TECH_DEFS[t as TechId].effects.militiaHp || TECH_DEFS[t as TechId].effects.militiaAttack));
    const relics = s.relics.filter((r) => CHRONICLES[r] && (CHRONICLES[r].effects.militiaHp || CHRONICLES[r].effects.militiaAttack));
    if (techs.length || relics.length) {
      let hp = 0;
      let atk = 0;
      for (const t of techs) {
        hp += TECH_DEFS[t as TechId].effects.militiaHp ?? 0;
        atk += TECH_DEFS[t as TechId].effects.militiaAttack ?? 0;
      }
      for (const r of relics) {
        hp += CHRONICLES[r].effects.militiaHp ?? 0;
        atk += CHRONICLES[r].effects.militiaAttack ?? 0;
      }
      out.push({
        id: 'tech', icon: '⚙', name: 'Pesquisas e relíquias', kind: 'gray',
        effect: [hp ? `+${hp} de vida base` : '', atk ? `+${atk} de ataque base` : ''].filter(Boolean).join(' e '),
        source: [...techs.map((t) => TECH_DEFS[t as TechId].name), ...relics.map((r) => CHRONICLES[r].relic ?? CHRONICLES[r].name)].join(', '),
      });
    }
  }

  if (u.noble) {
    const b = u.battalion ? battalionOf(sim, u.battalion) : undefined;
    const cmd = b?.commanderId === u.id;
    out.push({
      id: 'noble', icon: '♞', name: f ? 'Nobre dama' : 'Nobre cavaleiro', kind: 'gold',
      effect:
        `+${N.extraHp} de vida base, +${N.lanceDamage} de dano base (lança dourada), aura de +${pct(N.auraBonus)} para os militares por perto, ` +
        `prioridade no hospital${cmd ? `, +${pct(N.leadershipBonus)} no bônus de comando (que também vale para si)` : ''}`,
      source: 'Título de nobreza',
    });
  }

  if (isLegend(u)) {
    out.push({
      id: 'legend', icon: '✧', name: 'Lenda', kind: 'gold',
      effect: `Aura de +${pct(L.auraBonus)} para os militares por perto; titãs a até ${L.radius} tiles perdem ${pct(L.titanHpReduction)} de vida e ${pct(L.titanDamageReduction)} de dano; escudo de ${L.shield}`,
      source: 'Nível máximo',
    });
  }

  const lead = leadershipBonus(s, u);
  if (lead > 0) {
    const b = battalionOf(sim, u.battalion);
    const c = b && sim.unit(b.commanderId);
    out.push({
      id: 'lead', icon: '★', name: 'Liderança', kind: 'blue',
      effect: `+${pct(lead)} de vida e ataque`,
      source: c && c !== u ? `${c.name}, comandante do ${b!.name} (nível ${c.level}${c.noble ? ', nobre' : ''})` : `Comandar o ${b?.name ?? 'batalhão'} sendo nobre`,
    });
  }

  const auras = auraSources(s, u);
  if (auras.noble) {
    out.push({
      id: 'auraNoble', icon: '♛', name: 'Aura de nobreza', kind: 'gold',
      effect: `+${pct(N.auraBonus)} de vida e ataque`,
      source: `${isFemaleName(auras.noble.name) ? 'Nobre dama' : 'Nobre cavaleiro'} ${auras.noble.name}`,
    });
  }
  if (auras.legend) {
    out.push({
      id: 'auraLegend', icon: '✦', name: 'Aura da lenda', kind: 'gold',
      effect: `+${pct(L.auraBonus)} de vida e ataque`,
      source: `Lenda ${auras.legend.name}`,
    });
  }

  const n = honors(u);
  if (n > 0) {
    out.push({
      id: 'honor', icon: '✪', name: `Honras (${n}/${BALANCE.honor.max})`, kind: 'gold',
      effect: `+${pct(honorBonus(u))} de vida e ataque`,
      source: `${u.kills} titãs abatidos (uma honra a cada ${BALANCE.honor.killsPerHonor})`,
    });
  }

  const sh = shieldInfo(s, u);
  if (sh.max > 0) {
    const legendSrc = isLegend(u) ? 'Lenda (próprio)' : `Lenda ${s.units.find((l) => l !== u && l.battalion === u.battalion && isLegend(l))?.name ?? ''} no batalhão`;
    out.push({
      id: 'shield', icon: '◈', name: `Escudo (${Math.ceil(u.shield)}/${sh.max})`, kind: 'blue',
      effect: `Absorve até ${sh.max} de dano; recarrega após ${sh.recharge} s fora de combate`,
      source: legendSrc,
    });
  }

  if (u.speedBonus > 0) {
    const b = battalionOf(sim, u.battalion);
    const nobles = b ? [b.commanderId, ...b.memberIds].map((id) => sim.unit(id)).filter((x) => x?.noble) : [];
    out.push({
      id: 'speed', icon: '»', name: 'Marcha nobre', kind: 'green',
      effect: `+${pct(u.speedBonus)} de velocidade`,
      source: nobles.length ? `${nobles.map((x) => x!.name).join(', ')} no batalhão` : 'Nobre no batalhão',
    });
  }

  // Hospital: prioridade por estar no batalhão de um nobre (o próprio nobre já mostra no título).
  if (!u.noble && u.battalion) {
    const b = battalionOf(sim, u.battalion);
    const noble = b && [b.commanderId, ...b.memberIds].map((id) => sim.unit(id)).find((x) => x?.noble);
    if (noble) {
      out.push({ id: 'hospital', icon: '✚', name: 'Prioridade no hospital', kind: 'green', effect: 'É curado antes dos outros pacientes', source: `Batalhão de ${noble.name}` });
    }
  }

  // Experiência extra: treinador nobre/lenda e caça com o batalhão.
  if (u.order.type === 'train') {
    const field = sim.building(u.order.buildingId);
    const t = field && trainer(sim, field);
    if (t && t !== u && (t.noble || isLegend(t))) {
      const xp = (t.noble ? N.trainerXp : 0) + (isLegend(t) ? L.trainerXp : 0);
      out.push({ id: 'trainXp', icon: '✎', name: 'Treinador ilustre', kind: 'green', effect: `+${xp} de experiência por segundo`, source: `${t.name} (${[t.noble ? 'nobre' : '', isLegend(t) ? 'lenda' : ''].filter(Boolean).join(' e ')})` });
    }
    if (t === u && u.noble) {
      out.push({ id: 'trainSelf', icon: '✎', name: 'Ensinar como nobre', kind: 'green', effect: `+${N.trainerXp} de experiência por segundo enquanto houver alunos`, source: 'Título de nobreza' });
    }
  }
  if (u.battalion) {
    const b = battalionOf(sim, u.battalion);
    const c = b && sim.unit(b.commanderId);
    const xp = c ? Math.floor(c.level / S.huntXpPerLevels) : 0;
    if (b && c && b.mode === 'hunt' && !b.inHospital && xp > 0) {
      out.push({ id: 'huntXp', icon: '⌖', name: 'Caçada', kind: 'green', effect: `+${xp} de experiência por segundo`, source: `Modo caçar sob ${c.name} (nível ${c.level})` });
    }
  }
  return out;
}

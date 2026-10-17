import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, formatCost } from '../data/defs';
import { TECH_IDS, TECH_DEFS } from '../data/techs';
import type { Sim } from '../core/sim';
import { getClock } from '../core/time';
import { canAfford, pay } from './commands';
import { addLog } from '../state';
import { addMoraleMod } from './damage';

// O que cada era libera (texto para o aviso de nova era).
export const ERA_UNLOCKS = [
  '',
  'Quartel (lanceiros), Campo de Arqueiros (arqueiros), muro, portão e torre de pedra. Titãs maiores — e os primeiros anormais.',
];

// Avança para a próxima era, se todos os marcos foram cumpridos. Retorna erro ou null.
export function advanceEra(sim: Sim): string | null {
  const s = sim.state;
  if (s.era >= 1) return 'A próxima era ainda não está disponível.';
  const ms = eraMilestones(sim);
  if (!ms.every((m) => m.done)) return 'Ainda faltam marcos para avançar.';
  pay(sim, BALANCE.era.toVila.cost);
  s.era++;
  const text = `A vila chega à ${ERA_NAMES[s.era]}! ${ERA_UNLOCKS[s.era]}`;
  addLog(s, text);
  const c = s.world.width / 2;
  sim.alerts.push({ kind: 'victory', text: `Nova era: ${ERA_NAMES[s.era]}!`, x: c * sim.tileSize, y: c * sim.tileSize });
  addMoraleMod(sim, 'Nova era', BALANCE.era.newEraMorale, 72);
  return null;
}

export const ERA_NAMES = ['Era I — Refúgio', 'Era II — Vila', 'Era III — Fortaleza', 'Era IV — Grandes Muralhas'];

export interface Milestone {
  label: string;
  done: boolean;
  progress: string;
}

// A vila está cercada se, partindo do Centro da Vila, não dá para chegar à borda do mapa
// sem atravessar uma construção (muralha, portão, edifício) ou terreno intransponível.
// Resultado guardado por uma hora de jogo, porque a busca pode percorrer muitos tiles.
const enclosedCache = new WeakMap<Sim, { hour: number; value: boolean }>();

export function isEnclosed(sim: Sim): boolean {
  const hour = Math.floor(sim.state.tick / ((BALANCE.time.ticksPerSecond * BALANCE.time.secondsPerDay) / 24));
  const hit = enclosedCache.get(sim);
  if (hit && hit.hour === hour) return hit.value;
  const value = computeEnclosed(sim);
  enclosedCache.set(sim, { hour, value });
  return value;
}

export function invalidateEnclosure(sim: Sim): void {
  enclosedCache.delete(sim);
}

function computeEnclosed(sim: Sim): boolean {
  const tc = sim.state.buildings.find((b) => b.kind === 'townCenter');
  if (!tc) return false;
  const w = sim.state.world.width;
  const h = sim.state.world.height;
  const seen = new Uint8Array(w * h);
  const queue: number[] = [];
  const size = BUILDING_DEFS.townCenter.size;
  const blocked = (x: number, y: number) => {
    if (!sim.nav.isTerrainWalkable(x, y)) return true;
    const b = sim.buildingAt(x, y);
    return !!b && !BUILDING_DEFS[b.kind].walkable && !b.ruined;
  };
  for (let y = tc.ty - 1; y <= tc.ty + size; y++) {
    for (let x = tc.tx - 1; x <= tc.tx + size; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || blocked(x, y)) continue;
      seen[y * w + x] = 1;
      queue.push(y * w + x);
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % w;
    const y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return false;
    // Diagonais incluídas: uma muralha diagonal "furada" não conta como fechada.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        const ni = ny * w + nx;
        if (seen[ni] || blocked(nx, ny)) continue;
        // Diagonal só passa se um dos lados estiver aberto (igual ao movimento das unidades).
        if (dx && dy && blocked(x + dx, y) && blocked(x, y + dy)) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return true;
}

// Marcos da era atual para chegar à próxima (só existem para a Era I por enquanto).
export function eraMilestones(sim: Sim): Milestone[] {
  const s = sim.state;
  if (s.era >= 1) return [];
  const r = BALANCE.era.toVila;
  const day = getClock(s.tick).day;
  const pop = s.units.length;
  const lvl2 = s.buildings.filter((b) => b.kind === 'house' && b.built && b.level >= 2).length;
  const eraTechs = TECH_IDS.filter((id) => TECH_DEFS[id].era === 0);
  const techs = s.techs.filter((t) => eraTechs.includes(t as never)).length;
  const enclosed = isEnclosed(sim);
  return [
    { label: `Sobreviver ${r.days} dias`, done: day >= r.days, progress: `dia ${day}/${r.days}` },
    { label: `População de ${r.population}`, done: pop >= r.population, progress: `${pop}/${r.population}` },
    { label: 'Vila totalmente cercada (paliçada, portões e edifícios)', done: enclosed, progress: enclosed ? 'cercada' : 'há passagens abertas' },
    { label: `${r.level2Houses} casas de madeira ou melhores`, done: lvl2 >= r.level2Houses, progress: `${lvl2}/${r.level2Houses}` },
    { label: `Pesquisar ${r.techs} de ${eraTechs.length} tecnologias da era`, done: techs >= r.techs, progress: `${techs}/${r.techs}` },
    {
      label: `Repelir ${r.greatAttacksRepelled} Grandes Ataques`,
      done: s.stats.greatAttacksRepelled >= r.greatAttacksRepelled,
      progress: `${s.stats.greatAttacksRepelled}/${r.greatAttacksRepelled}`,
    },
    { label: `Abater ${r.titansKilled} titãs`, done: s.stats.titansKilled >= r.titansKilled, progress: `${s.stats.titansKilled}/${r.titansKilled}` },
    { label: `Estoque: ${formatCost(r.cost)}`, done: canAfford(sim, r.cost), progress: canAfford(sim, r.cost) ? 'ok' : 'falta' },
  ];
}

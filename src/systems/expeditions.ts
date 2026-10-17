import { BALANCE } from '../data/balance';
import { LORE } from '../data/lore';
import { UNIT_DEFS, RESOURCE_NAMES } from '../data/defs';
import type { Sim } from '../core/sim';
import { addLog, newUnit } from '../state';
import type { Poi, PoiKind, ResourceKind, Unit } from '../entities/types';
import { randomName } from '../entities/names';
import { addMoraleMod } from './damage';
import { setOrder } from './units';
import { spawnTitan } from './titans';

// Mundo externo: o que acontece nos pontos de interesse quando os moradores chegam lá.
// Não há tela separada — as expedições acontecem no mesmo mapa, com as unidades comandadas pelo jogador.

const P = BALANCE.pois;
const DT = 1 / BALANCE.time.ticksPerSecond;

export const POI_NAMES: Record<PoiKind, string> = {
  ruins: 'Ruínas',
  survivors: 'Sobreviventes isolados',
  nest: 'Ninho de titãs',
  deposit: 'Jazida valiosa',
  lore: 'Local de história',
};

export const POI_HINTS: Record<PoiKind, string> = {
  ruins: `Mande qualquer morador ficar aqui por ${P.ruinsSearchSeconds} s para vasculhar e trazer o que sobrou.`,
  survivors: 'Leve qualquer unidade até eles: eles se juntam à vila e caminham até o Centro da Vila.',
  nest: `De onde vêm titãs. Para destruí-lo, mantenha soldados aqui por ${P.nestClearSeconds} s sem nenhum titã a ${P.nestClearRadius} tiles.`,
  deposit: 'Um veio de ferro muito rico. Construa um Depósito de Mineração por perto e mande aldeões — com escolta.',
  lore: `Mande alguém ficar aqui por ${P.loreReadSeconds} s para ler o que restou.`,
};

const DIRS = ['leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste', 'norte', 'nordeste'];

export function poiDirection(sim: Sim, p: Poi): string {
  const c = sim.state.world.width / 2;
  const a = Math.atan2(p.ty - c, p.tx - c);
  return DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

export function poiAt(sim: Sim, tx: number, ty: number): Poi | undefined {
  return sim.state.pois.find((p) => p.discovered && Math.abs(p.tx - tx) <= 1 && Math.abs(p.ty - ty) <= 1);
}

// Chamado pela névoa de guerra quando um ponto entra na visão pela primeira vez.
export function onPoiDiscovered(sim: Sim, p: Poi): void {
  const ts = sim.tileSize;
  const text = `Descoberta a ${poiDirection(sim, p)}: ${POI_NAMES[p.kind].toLowerCase()}.`;
  addLog(sim.state, text);
  sim.alerts.push({ kind: 'discovery', text, x: (p.tx + 0.5) * ts, y: (p.ty + 0.5) * ts });
  if (p.kind === 'nest') {
    // O ninho tem guardiões.
    for (let i = 0; i < P.nestGuards; i++) {
      const at = nearbyFreeTile(sim, p.tx, p.ty, 4);
      if (at) spawnTitan(sim, 3 + sim.rng.range(0, 2.5), undefined, at);
    }
  }
}

function nearbyFreeTile(sim: Sim, tx: number, ty: number, radius: number): { tx: number; ty: number } | null {
  for (let i = 0; i < 20; i++) {
    const x = tx + sim.rng.int(-radius, radius);
    const y = ty + sim.rng.int(-radius, radius);
    if (sim.nav.isFree(x, y)) return { tx: x, ty: y };
  }
  return null;
}

// Ninhos ainda ativos podem ser a origem de titãs avulsos (no lugar da borda do mapa).
export function nestSpawnPoint(sim: Sim): { tx: number; ty: number } | null {
  const nests = sim.state.pois.filter((p) => p.kind === 'nest' && !p.done);
  if (!nests.length || !sim.rng.chance(P.nestSpawnShare)) return null;
  const n = nests[sim.rng.int(0, nests.length - 1)];
  return nearbyFreeTile(sim, n.tx, n.ty, 3);
}

function unitsNear(sim: Sim, p: Poi, filter: (u: Unit) => boolean = () => true): Unit[] {
  const ts = sim.tileSize;
  const r = (P.interactRadius + 0.5) * ts;
  const cx = (p.tx + 0.5) * ts;
  const cy = (p.ty + 0.5) * ts;
  return sim.state.units.filter((u) => !u.garrison && filter(u) && Math.hypot(u.x - cx, u.y - cy) <= r);
}

function complete(sim: Sim, p: Poi, text: string): void {
  p.done = true;
  addLog(sim.state, text);
  const ts = sim.tileSize;
  sim.alerts.push({ kind: 'discovery', text, x: (p.tx + 0.5) * ts, y: (p.ty + 0.5) * ts });
  addMoraleMod(sim, 'Expedições bem-sucedidas', P.successMorale, 24);
}

export function updateExpeditions(sim: Sim): void {
  const s = sim.state;
  for (const p of s.pois) {
    if (!p.discovered || p.done) continue;
    switch (p.kind) {
      case 'ruins': {
        if (!unitsNear(sim, p).length) break;
        p.progress += DT;
        if (p.progress >= P.ruinsSearchSeconds) {
          const loot = P.ruinsLoot[p.value % P.ruinsLoot.length];
          const parts: string[] = [];
          for (const [k, v] of Object.entries(loot) as [ResourceKind, number][]) {
            s.resources[k] += v;
            parts.push(`${v} de ${RESOURCE_NAMES[k].toLowerCase()}`);
          }
          complete(sim, p, `Ruínas vasculhadas: ${parts.join(', ')}.`);
        }
        break;
      }
      case 'survivors': {
        const rescuer = unitsNear(sim, p)[0];
        if (!rescuer) break;
        const ts = sim.tileSize;
        const c = s.world.width / 2;
        for (let i = 0; i < p.value; i++) {
          const u = newUnit(sim.nextId(), 'villager', randomName(sim.rng), (p.tx + 0.5 + (i % 2)) * ts, (p.ty + 0.5 + Math.floor(i / 2)) * ts);
          u.hp = UNIT_DEFS.villager.maxHp;
          s.units.push(u);
          setOrder(u, { type: 'move', tx: Math.round(c + sim.rng.int(-3, 3)), ty: Math.round(c + 4 + sim.rng.int(0, 2)) });
        }
        complete(sim, p, `${p.value} sobreviventes resgatados! Eles seguem para o Centro da Vila — proteja-os no caminho.`);
        break;
      }
      case 'lore': {
        if (!unitsNear(sim, p).length) break;
        p.progress += DT;
        if (p.progress >= P.loreReadSeconds) {
          const f = LORE[p.value % LORE.length];
          complete(sim, p, `Local de história: "${f.title}". Leia em Descobertas.`);
        }
        break;
      }
      case 'nest': {
        const soldiers = unitsNear(sim, p, (u) => UNIT_DEFS[u.kind].military);
        if (!soldiers.length) break;
        const ts = sim.tileSize;
        const cx = (p.tx + 0.5) * ts;
        const cy = (p.ty + 0.5) * ts;
        const threatened = s.titans.some((t) => Math.hypot(t.x - cx, t.y - cy) <= P.nestClearRadius * ts);
        if (threatened) break;
        p.progress += DT;
        if (p.progress >= P.nestClearSeconds) complete(sim, p, 'Ninho de titãs destruído! Menos titãs virão daquela região.');
        break;
      }
      case 'deposit': {
        // Some do mapa quando o veio se esgota.
        if (s.tick % 100 === 0 && !s.world.resourceNodes.some((n) => n.kind === 'iron' && Math.abs(n.tx - p.tx) <= 3 && Math.abs(n.ty - p.ty) <= 3)) {
          p.done = true;
        }
        break;
      }
    }
  }
}

// Fragmentos de história já lidos (para a janela de Descobertas).
export function readLore(sim: Sim): number[] {
  return sim.state.pois.filter((p) => p.kind === 'lore' && p.done).map((p) => p.value % LORE.length);
}

import { BALANCE } from '../data/balance';
import type { Sim } from '../core/sim';
import { getClock } from '../core/time';
import { addLog, newUnit } from '../state';
import { randomName } from '../entities/names';
import { addMoraleMod, damageBuilding, killUnit } from './damage';
import { isCovered } from './city';
import { buildingMaxHp } from './modifiers';

// Eventos em cartas: de tempos em tempos algo acontece na cidade e o jogador escolhe o que fazer.

export interface EventChoice {
  label: string;
  detail: string;
  enabled?(sim: Sim, data: Record<string, number>): boolean;
  apply(sim: Sim, data: Record<string, number>): string; // retorna o texto do resultado (vai para o diário)
}

export interface EventDef {
  title: string;
  text(sim: Sim, data: Record<string, number>): string;
  eligible(sim: Sim): boolean;
  setup(sim: Sim): Record<string, number>;
  choices: EventChoice[];
}

const houses = (sim: Sim) => sim.state.buildings.filter((b) => b.kind === 'house' && b.built);

export const EVENT_DEFS: Record<string, EventDef> = {
  refugees: {
    title: 'Refugiados no portão',
    text: (_s, d) => `Um grupo de ${d.n} sobreviventes, magros e assustados, pede abrigo. Vieram de uma vila que os titãs destruíram.`,
    eligible: () => true,
    setup: (sim) => ({ n: sim.rng.int(2, 4) }),
    choices: [
      {
        label: 'Acolher',
        detail: 'Novos aldeões; custa 20 de comida por pessoa. A moral sobe.',
        enabled: (sim, d) => sim.state.resources.food >= d.n * 20,
        apply: (sim, d) => {
          const s = sim.state;
          s.resources.food -= d.n * 20;
          const tc = s.buildings.find((b) => b.kind === 'townCenter');
          const ts = sim.tileSize;
          for (let i = 0; i < d.n; i++) {
            const x = tc ? (tc.tx + 2 + i * 0.6) * ts : (s.world.width / 2) * ts;
            const y = tc ? (tc.ty + 5) * ts : (s.world.height / 2) * ts;
            s.units.push(newUnit(sim.nextId(), 'villager', randomName(sim.rng), x, y));
          }
          addMoraleMod(sim, 'Refugiados acolhidos', 5, 48);
          return `${d.n} refugiados foram acolhidos na vila.`;
        },
      },
      {
        label: 'Recusar',
        detail: 'Não há comida para todos. A moral cai.',
        apply: (sim) => {
          addMoraleMod(sim, 'Refugiados recusados', -5, 48);
          return 'Os refugiados seguiram viagem, sem esperança.';
        },
      },
    ],
  },
  fire: {
    title: 'Incêndio!',
    text: () => 'Uma fagulha da lareira pegou no telhado de uma casa. O fogo começa a se espalhar.',
    eligible: (sim) => houses(sim).length >= 3,
    setup: (sim) => {
      const list = houses(sim);
      return { house: list[sim.rng.int(0, list.length - 1)].id };
    },
    choices: [
      {
        label: 'Combater o fogo',
        detail: 'Gasta 30 de madeira em baldes e reparos; a casa fica danificada.',
        enabled: (sim) => sim.state.resources.wood >= 30,
        apply: (sim, d) => {
          sim.state.resources.wood -= 30;
          const b = sim.building(d.house);
          if (b) b.hp = Math.max(1, b.hp - buildingMaxHp(sim.state, b) * 0.3);
          return 'O fogo foi apagado a tempo.';
        },
      },
      {
        label: 'Deixar queimar',
        detail: 'A casa é perdida.',
        apply: (sim, d) => {
          const b = sim.building(d.house);
          if (b) damageBuilding(sim, b, b.hp + 1);
          addMoraleMod(sim, 'Incêndio', -4, 24);
          return 'A casa virou cinzas.';
        },
      },
    ],
  },
  harvest: {
    title: 'Colheita farta',
    text: () => 'O tempo foi generoso e as fazendas deram mais do que o esperado.',
    eligible: (sim) => {
      const season = getClock(sim.state.tick).seasonIndex;
      return (season === 1 || season === 2) && sim.state.buildings.some((b) => b.kind === 'farm' && b.built);
    },
    setup: () => ({}),
    choices: [
      {
        label: 'Fazer um festival',
        detail: 'Uma festa para todos: a moral sobe bastante por 3 dias.',
        apply: (sim) => {
          addMoraleMod(sim, 'Festival da colheita', 12, 72);
          return 'A vila celebrou a colheita com música e fogueiras.';
        },
      },
      {
        label: 'Guardar no celeiro',
        detail: '+150 de comida.',
        apply: (sim) => {
          sim.state.resources.food += 150;
          return 'A colheita extra foi guardada.';
        },
      },
    ],
  },
  merchant: {
    title: 'Mercador viajante',
    text: () => 'Um mercador corajoso atravessou as terras dos titãs com sua carroça e oferece negócios.',
    eligible: (sim) => getClock(sim.state.tick).day >= 6,
    setup: () => ({}),
    choices: [
      {
        label: 'Comprar pedra',
        detail: '150 de pedra por 60 de ouro.',
        enabled: (sim) => sim.state.resources.gold >= 60,
        apply: (sim) => {
          sim.state.resources.gold -= 60;
          sim.state.resources.stone += 150;
          return 'Compramos 150 de pedra do mercador.';
        },
      },
      {
        label: 'Vender madeira',
        detail: '200 de madeira por 50 de ouro.',
        enabled: (sim) => sim.state.resources.wood >= 200,
        apply: (sim) => {
          sim.state.resources.wood -= 200;
          sim.state.resources.gold += 50;
          return 'Vendemos 200 de madeira ao mercador.';
        },
      },
      {
        label: 'Dispensar',
        detail: 'Nada de negócios hoje.',
        apply: () => 'O mercador seguiu viagem.',
      },
    ],
  },
  sickness: {
    title: 'Doença',
    text: () => 'Uma febre se espalha entre as casas sem água limpa.',
    eligible: (sim) => houses(sim).filter((h) => !isCovered(sim, h, 'well')).length >= 3,
    setup: () => ({}),
    choices: [
      {
        label: 'Usar ervas e caldos',
        detail: 'Gasta 80 de comida; ninguém morre.',
        enabled: (sim) => sim.state.resources.food >= 80,
        apply: (sim) => {
          sim.state.resources.food -= 80;
          return 'Os doentes se recuperaram. Construir poços evitaria novos surtos.';
        },
      },
      {
        label: 'Esperar passar',
        detail: 'Alguém pode não resistir.',
        apply: (sim) => {
          const villagers = sim.state.units.filter((u) => u.kind === 'villager');
          if (villagers.length > 2) killUnit(sim, villagers[sim.rng.int(0, villagers.length - 1)], ['levado pela febre', 'levada pela febre']);
          return 'A febre passou, mas deixou sua marca.';
        },
      },
    ],
  },
};

export const EVENT_IDS = Object.keys(EVENT_DEFS);

// Uma vez por dia (de manhã) verifica se é hora de um novo evento.
export function updateEvents(sim: Sim): void {
  const s = sim.state;
  const clock = getClock(s.tick);
  const prev = getClock(s.tick - 1);
  if (clock.hour !== 7 || prev.hour === 7) return;
  if (s.events.active || clock.day < s.events.nextDay) return;
  const eligible = EVENT_IDS.filter((id) => EVENT_DEFS[id].eligible(sim));
  if (!eligible.length) return;
  const id = eligible[sim.rng.int(0, eligible.length - 1)];
  s.events.active = { id, data: EVENT_DEFS[id].setup(sim) };
  s.events.nextDay = clock.day + sim.rng.int(BALANCE.events.minDaysBetween, BALANCE.events.maxDaysBetween);
  sim.alerts.push({ kind: 'event', text: EVENT_DEFS[id].title, x: 0, y: 0 });
}

export function resolveEvent(sim: Sim, choice: number): string | null {
  const active = sim.state.events.active;
  if (!active) return null;
  const def = EVENT_DEFS[active.id];
  const c = def.choices[choice];
  if (!c || (c.enabled && !c.enabled(sim, active.data))) return null;
  const result = c.apply(sim, active.data);
  addLog(sim.state, `${def.title}: ${result}`);
  sim.state.events.active = null;
  return result;
}


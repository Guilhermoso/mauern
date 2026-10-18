import { SAVE_VERSION, initialExplored, newMarket, type GameState } from '../state';
import { BALANCE } from '../data/balance';
import { generatePois } from '../world/pois';

// Cada migração recebe um save da versão N e devolve o save na versão N + 1.
// Ao mudar a estrutura do GameState: incremente SAVE_VERSION e adicione a migração aqui.
type Migration = (save: any) => any;

const MIGRATIONS: Record<number, Migration> = {
  // v1 → v2: edifícios ganham construção, fila de treino e ponto de reunião; unidades ganham ordens.
  1: (save) => ({
    ...save,
    version: 2,
    buildings: save.buildings.map((b: any) => ({
      ...b,
      built: true,
      progress: 0,
      queue: [],
      rally: null,
      farmerId: 0,
    })),
    units: save.units.map((u: any) => ({
      ...u,
      order: { type: 'idle' },
      path: [],
      pathKey: '',
      pathComplete: true,
      carry: null,
      work: 0,
      moving: false,
    })),
  }),
  // v2 → v3: titãs, ameaça, combate, guarnição e sino de alarme.
  2: (save) => {
    const ticksPerHour = (20 * 240) / 24;
    const day = Math.floor((save.tick + 7 * ticksPerHour) / (ticksPerHour * 24)) + 1;
    return {
      ...save,
      version: 3,
      titans: [],
      alarm: false,
      // Cidades já existentes ganham um dia de calma antes do primeiro titã.
      threat: {
        nextSpawnTick: save.tick + ticksPerHour * 24,
        nextGreatAttackDay: Math.max(7, Math.ceil((day + 3) / 7) * 7),
        greatAttackAnnounced: false,
        greatAttackDir: 0,
      },
      buildings: save.buildings.map((b: any) => ({ ...b, attackCooldown: 0 })),
      units: save.units.map((u: any) => ({ ...u, garrison: 0, attackCooldown: 0, prevOrder: null })),
    };
  },
  // v3 → v4: Era I completa — casas com nível, moral, tecnologias, crônicas, estatísticas e eventos.
  3: (save) => {
    const ticksPerDay = 20 * 240;
    const day = Math.floor((save.tick + (7 * ticksPerDay) / 24) / ticksPerDay) + 1;
    return {
      ...save,
      version: 4,
      era: 0,
      techs: [],
      relics: [],
      morale: 60,
      moraleMods: [],
      stats: {
        titansKilled: 0,
        deaths: 0,
        greatAttacksRepelled: 0,
        flawlessHordes: 0,
        hordeDeathsAtStart: -1,
        gathered: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 },
        moraleHighHours: 0,
        wintersSurvived: 0,
        wintersWithoutHunger: 0,
      },
      city: { starving: false, cold: false, hungerThisWinter: false, taxCarry: 0 },
      events: { nextDay: day + 2, active: null },
      buildings: save.buildings.map((b: any) => ({ ...b, level: 1, needHours: 0, missingHours: 0, research: null })),
      titans: save.titans.map((t: any) => ({ ...t, horde: false })),
    };
  },
  // v4 → v5: experiência e patentes dos soldados, campos de treinamento e batalhões.
  4: (save) => ({
    ...save,
    version: 5,
    battalions: [],
    battalionCount: 0,
    buildings: save.buildings.map((b: any) => ({ ...b, trainerId: 0 })),
    units: save.units.map((u: any) => ({ ...u, level: 1, xp: 0, battalion: 0, speedCap: 0 })),
  }),
  // v5 → v6: treino em lotes, terror dos aldeões e campo de refúgio.
  5: (save) => ({
    ...save,
    version: 6,
    buildings: save.buildings.map((b: any) => ({
      ...b,
      guardId: 0,
      queue: b.queue.map((q: any) => ({ ...q, count: q.count ?? 1 })),
    })),
    units: save.units.map((u: any) => ({ ...u, terror: 0 })),
  }),
  // v6 → v7: hospital de milícia e estado crítico dos batalhões.
  6: (save) => ({
    ...save,
    version: 7,
    buildings: save.buildings.map((b: any) => ({ ...b, doctorIds: [], upgradeProgress: -1 })),
    battalions: save.battalions.map((b: any) => ({ ...b, criticalIds: [b.commanderId], autoHospital: true, inHospital: 0 })),
  }),
  // v7 → v8: nobreza, honras, lendas (escudos) e formações dos batalhões.
  7: (save) => ({
    ...save,
    version: 8,
    units: save.units.map((u: any) => ({ ...u, noble: false, kills: 0, shield: 0, lastCombatTick: 0, speedBonus: 0 })),
    battalions: save.battalions.map((b: any) => ({ ...b, formation: 'block' })),
  }),
  // v8 → v9: mundo externo — névoa de guerra, pontos de interesse e memorial.
  8: (save) => {
    const w = save.world;
    const ts = BALANCE.world.tileSize;
    // Já foi visto o que está perto da cidade e dos moradores atuais.
    const discs = [
      { x: w.width / 2, y: w.height / 2, r: BALANCE.fog.startRadius },
      ...save.buildings.map((b: any) => ({ x: b.tx + 1, y: b.ty + 1, r: 12 })),
      ...save.units.map((u: any) => ({ x: u.x / ts, y: u.y / ts, r: 10 })),
    ];
    const pois = generatePois(w, save.seed, () => save.nextId++, (x, y) => save.buildings.some((b: any) => Math.abs(b.tx - x) < 6 && Math.abs(b.ty - y) < 6));
    return { ...save, version: 9, memorial: [], pois, explored: initialExplored(w.width, w.height, discs) };
  },
  // v9 → v10: Era II — muros de pedra viram escombros (campo novo nos edifícios).
  9: (save) => ({ ...save, version: 10, buildings: save.buildings.map((b: any) => ({ ...b, ruined: false })) }),
  // v10 → v11: Era II, fase 2 — lã, pão e roupas, oficinas, mercado e necessidades dos sobrados.
  10: (save) => ({
    ...save,
    version: 11,
    resources: { wool: 0, bread: 0, clothes: 0, ...save.resources },
    stats: save.stats && { ...save.stats, gathered: { wool: 0, bread: 0, clothes: 0, ...save.stats.gathered } },
    city: { lackBread: false, lackClothes: false, ...save.city },
    market: newMarket(),
    buildings: save.buildings.map((b: any) => ({ ...b, produce: 0 })),
  }),
  // v11 → v12: guardiões de ninho presos ao ninho (campo novo nos titãs).
  11: (save) => ({ ...save, version: 12, titans: (save.titans ?? []).map((t: any) => ({ ...t, leash: null })) }),
};

export function migrate(save: any): GameState {
  while (save.version < SAVE_VERSION) {
    const m = MIGRATIONS[save.version];
    if (!m) throw new Error(`Sem migração para o save v${save.version}.`);
    save = m(save);
  }
  return save as GameState;
}

import { SAVE_VERSION, type GameState } from '../state';

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
};

export function migrate(save: any): GameState {
  while (save.version < SAVE_VERSION) {
    const m = MIGRATIONS[save.version];
    if (!m) throw new Error(`Sem migração para o save v${save.version}.`);
    save = m(save);
  }
  return save as GameState;
}

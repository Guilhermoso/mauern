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
};

export function migrate(save: any): GameState {
  while (save.version < SAVE_VERSION) {
    const m = MIGRATIONS[save.version];
    if (!m) throw new Error(`Sem migração para o save v${save.version}.`);
    save = m(save);
  }
  return save as GameState;
}

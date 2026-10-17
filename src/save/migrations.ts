import { SAVE_VERSION, type GameState } from '../state';

// Cada migração recebe um save da versão N e devolve o save na versão N + 1.
// Ao mudar a estrutura do GameState: incremente SAVE_VERSION e adicione a migração aqui.
type Migration = (save: any) => any;

const MIGRATIONS: Record<number, Migration> = {
  // 1: (save) => ({ ...save, novoCampo: valorPadrao, version: 2 }),
};

export function migrate(save: any): GameState {
  while (save.version < SAVE_VERSION) {
    const m = MIGRATIONS[save.version];
    if (!m) throw new Error(`Sem migração para o save v${save.version}.`);
    save = m(save);
  }
  return save as GameState;
}

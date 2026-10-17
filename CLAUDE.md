# Mauern — notas para o Claude

- Jogo em TypeScript + Vite + PixiJS v8. Design completo em `docs/DESIGN.md`; o roteiro de etapas está na seção 16.
- Textos do jogo, comentários e mensagens de commit em português.
- A simulação (`src/core/simulation.ts` e sistemas) não pode depender do PixiJS nem do DOM; a renderização só lê o estado.
- Todo o estado do jogo fica em `GameState` (`src/state.ts`), serializável, com entidades referenciadas por ID.
- Ao mudar a estrutura do `GameState`: incremente `SAVE_VERSION` e adicione uma migração em `src/save/migrations.ts`. Saves antigos dos jogadores nunca podem quebrar.
- Números de balanceamento ficam em `src/data/balance.ts`, nunca espalhados pelo código.
- Antes de commitar: `npm run typecheck && npm test && npm run build`.

# Mauern

RTS / city builder / tower defense em 2D (visão de cima), inspirado em "Attack on Titan".
Uma única partida contínua e persistente: construa, evolua pelas eras e proteja a cidade dos titãs.

O documento de design completo está em [docs/DESIGN.md](docs/DESIGN.md).

## Controles (até agora)

| Ação | Controle |
| --- | --- |
| Mover a câmera | WASD / setas, mouse na borda da tela, arrastar com o botão do meio |
| Zoom | Roda do mouse |
| Ir ao Centro da Vila | H |
| Pausar / continuar | Espaço |
| Velocidade | + / − ou botões na barra superior |
| Menu (salvar, exportar, importar, nova cidade) | Esc |
| Painel de debug | F3 |

O jogo salva sozinho a cada 30 segundos e ao fechar a aba (no próprio navegador).

## Desenvolvimento

Requer Node.js 22+.

```bash
npm install
npm run dev        # servidor local com recarga automática
npm test           # testes
npm run typecheck  # verificação de tipos
npm run build      # build de produção em dist/
```

Estrutura: `src/core` (laço, tempo, aleatoriedade), `src/world` (mapa e geração), `src/entities`,
`src/render` (PixiJS), `src/input`, `src/ui`, `src/save` (IndexedDB e migrações), `src/data/balance.ts`
(todos os números de balanceamento).

# Mauern

RTS / city builder / tower defense em 2D (visão de cima), inspirado em "Attack on Titan".
Uma única partida contínua e persistente: construa, evolua pelas eras e proteja a cidade dos titãs.

O documento de design completo está em [docs/DESIGN.md](docs/DESIGN.md).

## Como jogar

Você começa com o Centro da Vila, 4 aldeões e 1 batedor. Coloque os aldeões para coletar comida e madeira,
treine mais aldeões no Centro da Vila e construa casas para aumentar o limite de população.

| Ação | Controle |
| --- | --- |
| Selecionar | Clique esquerdo; arraste para selecionar várias unidades; Shift+clique adiciona |
| Selecionar todas do mesmo tipo na tela | Duplo clique numa unidade |
| Dar ordem (andar, coletar, construir, entregar) | Clique direito no destino |
| Construir (com aldeão selecionado) | Botões do painel ou Q casa · E depósito de madeira · R depósito de mineração · F moinho · G fazenda. Shift+clique constrói várias |
| Treinar aldeão (Centro da Vila selecionado) | Q (Shift+Q treina 5) |
| Ponto de reunião (Centro da Vila selecionado) | Clique direito no mapa ou num recurso |
| Grupos de controle | Ctrl+1–9 cria · 1–9 seleciona · duas vezes centraliza |
| Próximo aldeão ocioso | . (ponto) ou botão "Ociosos" |
| Selecionar o Centro da Vila | H |
| Parar / dispensar / demolir | Botões do painel · Delete |
| Mover a câmera | WASD / setas, mouse na borda da tela, arrastar com o botão do meio |
| Zoom | Roda do mouse |
| Pausar / velocidade | Espaço · + / − ou botões na barra superior |
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

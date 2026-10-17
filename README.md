# Mauern

RTS / city builder / tower defense em 2D (visão de cima), inspirado em "Attack on Titan".
Uma única partida contínua e persistente: construa, evolua pelas eras e proteja a cidade dos titãs.

O documento de design completo está em [docs/DESIGN.md](docs/DESIGN.md).

## Como jogar

Você começa com o Centro da Vila, 4 aldeões e 1 batedor. Coloque os aldeões para coletar comida e madeira,
treine mais aldeões no Centro da Vila e construa casas para aumentar o limite de população.

Os primeiros dias são calmos. Depois, titãs começam a vir das bordas do mapa — de dia são rápidos, à noite
ficam lentos. A cada 7 dias há um **Grande Ataque**, anunciado na véspera. Cerque a vila com paliçada,
construa torres de vigia, treine milicianos e, no aperto, toque o sino para os aldeões se abrigarem.
Titãs não abatidos continuam no mundo. Se o Centro da Vila cair, a cidade está perdida.

**A vida na cidade:** cada habitante come todo dia, e no inverno as fazendas param e as casas queimam lenha —
estoque antes. As casas evoluem (barraca → casa de madeira → casa de pedra) quando têm um poço e uma fogueira
comunitária por perto e a moral está boa; casas melhores abrigam mais gente e pagam impostos em ouro.
A **moral** (barra superior; passe o mouse para ver o porquê) acelera ou atrasa todo o trabalho.
Pesquise tecnologias nos edifícios, cumpra as **Crônicas** para ganhar relíquias e acompanhe no botão da era
os marcos para evoluir. De tempos em tempos um evento pede uma decisão sua.

**Soldados e batalhões:** cada soldado tem experiência e nível (1 a 100), com 100 patentes — de Recruta I a
Comandante Supremo V. Subir de nível aumenta vida e ataque. Eles ganham experiência lutando contra titãs e
treinando no **Campo de Treinamento**: mande soldados para lá e escolha um deles como treinador (quanto maior
o nível do treinador, mais rápido os outros aprendem; ele também ganha experiência ensinando). Forme
**batalhões** (tecla B com soldados selecionados): o de maior nível comanda, e o nível dele define quantos
soldados cabem. O batalhão anda em formação, é selecionado como um só e pode ficar no modo manual, defender
uma posição ou caçar titãs pelo mapa.

**Treino em lotes:** unidades militares treinam em lotes de até 3, como no Age of Empires III — cada clique soma
uma unidade ao lote, Shift+clique enfileira um lote cheio, e o lote sai junto (mais rápido do que um por um).
O progresso aparece como uma pizza girando no sentido horário sobre o ícone.

**Hospital de Milícia:** soldados feridos (clique direito no hospital) ficam internados e protegidos; até 3
aldeões designados como médicos curam um soldado cada por vez, e quem chega a 100% sai sozinho. O hospital tem
20 leitos e pode ser ampliado até o nível 5 (100 leitos). Batalhões em **estado crítico** (uma unidade marcada
com ✚ abaixo de 30% de vida — por padrão só o comandante) correm sozinhos para um hospital com leitos para
todos, entram juntos e saem juntos quando todos sararem.

**Aldeões espertos:** quando um titã chega perto, os aldeões largam o que estão fazendo e correm para um abrigo
— de preferência o **Campo de Refúgio**. Eles ficam aterrorizados por um tempo e não saem até o terror passar;
um soldado no posto do refúgio acalma o terror mais rápido (quanto maior o nível, mais rápido). Depois, você
escolhe: **Sair** (ficam ociosos) ou **Voltar ao trabalho** (retomam o que faziam antes de fugir).

| Ação | Controle |
| --- | --- |
| Selecionar | Clique esquerdo; arraste para selecionar várias unidades; Shift+clique adiciona |
| Selecionar todas do mesmo tipo na tela | Duplo clique numa unidade |
| Dar ordem (andar, coletar, construir, entregar) | Clique direito no destino |
| Construir (com aldeão selecionado) | Botões do painel ou Q casa · V poço · C fogueira · E depósito de madeira · R depósito de mineração · F moinho · G fazenda · T torre de vigia. Shift+clique constrói várias |
| Pesquisar tecnologias | Selecione o edifício (Centro da Vila, depósitos, moinho, torre) e use os botões azuis |
| Paliçada (com aldeão selecionado) | Z e arraste para traçar a linha · X portão (pode ser posto sobre a paliçada) |
| Treinar (Centro da Vila selecionado) | Q aldeão · E miliciano (Shift treina 5) |
| Campo de treinamento (com aldeão selecionado) | Y. Depois: clique direito no campo com soldados e escolha o treinador no painel |
| Formar batalhão | B com soldados selecionados · modos e "Desfazer" no painel do batalhão |
| Campo de Refúgio (com aldeão selecionado) | U. Para pôr um guarda: clique direito no refúgio com um soldado |
| Liberar abrigados (edifício selecionado) | U ou botões "Sair" / "Voltar ao trabalho" |
| Hospital (com aldeão selecionado) | I. Clique direito nele com aldeões (médicos) ou soldados feridos; batalhões também |
| Seleção | Duplo clique ignora unidades dentro de edifícios; a caixa pega só militares se houver algum nela |
| Atacar um titã | Selecione unidades e clique direito no titã |
| Abrigar unidades | Clique direito no Centro da Vila ou numa torre · U libera os abrigados |
| Sino de alarme (Centro da Vila selecionado) | B toca / desliga: aldeões se abrigam e depois voltam ao trabalho |
| Reparar | Clique direito com aldeões num edifício danificado |
| Ponto de reunião (Centro da Vila selecionado) | Clique direito no mapa ou num recurso |
| Grupos de controle | Ctrl+1–9 cria · 1–9 seleciona · duas vezes centraliza |
| Próximo aldeão ocioso | . (ponto) ou botão "Ociosos" |
| Selecionar o Centro da Vila | H |
| Parar / dispensar / demolir | Botões do painel · Delete |
| Mover a câmera | WASD / setas, mouse na borda da tela, arrastar com o botão do meio |
| Zoom | Roda do mouse |
| Pausar / velocidade | Espaço · + / − ou botões na barra superior |
| Notificações (titã avistado, ataque) | Clique nelas para ir ao local |
| Menu (salvar, exportar, importar, nova cidade, sons) | Esc |
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

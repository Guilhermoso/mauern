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
uma posição ou caçar titãs pelo mapa. O comandante dá um **bônus de liderança**: soldados a até 8 tiles dele
ganham +0,5% de ataque e vida por nível do comandante (nível 20 = +10%, nível 100 = +50%).
No modo caçar, todo o batalhão ganha 1 de experiência por segundo a cada 20 níveis do comandante. A partir do
nível 40, o comandante libera as **formações**: bloco, linha, coluna, cunha e círculo.

**Honras, nobreza e lendas:** a cada 10 titãs abatidos o soldado ganha uma **honra** (+2% de vida e ataque cada,
até 10; com 10 honras, +30%). Militares de nível 70+ podem receber um **título de nobreza** (500 de ouro pelo
1º nobre, 1000 pelo 2º, 1500 pelo 3º... + 40 de ouro por dia cada): montam a cavalo com lança dourada (+5 de dano e +50 de vida base), dão +5% de vida e ataque aos
militares por perto, aceleram o próprio batalhão em 5%, somam +10% ao bônus de comando (e o recebem também),
têm prioridade no hospital e, como treinadores, dão +5 de experiência por segundo. Se um nobre morrer, a moral
despenca. No nível 100 o soldado vira **lenda**: +10% de vida e ataque para os militares por perto, intimida os
titãs ao redor (-5% de vida e -10% de dano), tem um escudo de 30 (recarrega após 20 s fora de combate) e dá um
escudo de 10 ao seu batalhão (recarrega após 60 s). Todos os bônus se somam sempre sobre os valores base.

**Treino em lotes:** unidades militares treinam em lotes de até 3, como no Age of Empires III — cada clique soma
uma unidade ao lote, Shift+clique enfileira um lote cheio, e o lote sai junto (mais rápido do que um por um).
O progresso aparece como uma pizza girando no sentido horário sobre o ícone.

**Hospital de Milícia:** soldados feridos (clique direito no hospital) ficam internados e protegidos; até 3
aldeões designados como médicos curam um soldado cada por vez, e quem chega a 100% sai sozinho. O hospital tem
20 leitos e pode ser ampliado até o nível 5 (100 leitos). Batalhões em **estado crítico** (uma unidade marcada
com ✚ abaixo de 30% de vida — por padrão só o comandante) correm sozinhos para um hospital com leitos para
todos, entram juntos e saem juntos quando todos sararem.

**Era II — Vila:** cumpridos os marcos da Era I (janela da era, na barra de cima), avance de era. A Era II libera
o **Quartel** (lanceiros: infantaria pesada), o **Campo de Arqueiros** (arqueiros atacam de longe; dentro de torres
somam o próprio ataque às flechas), o **muro e o portão de pedra** (arraste por cima da paliçada para trocá-la — a
obra mantém a vida da paliçada até ficar mais forte) e a **torre de pedra**. Muro e portão de pedra destruídos viram
**escombros** passáveis: mande aldeões reconstruir (sem custo) — só somem se você demolir. Na Era II também surgem os
**titãs anormais**: mais rápidos, mais resistentes e imprevisíveis.

**Produção e necessidades (Era II):** o **Pasto de Ovelhas** produz lã, a **Padaria** transforma comida em pão e a
**Tecelagem** transforma lã em roupas — cada oficina tem um trabalhador (clique direito com um aldeão; quem constrói já
fica trabalhando). Casas de pedra com capela por perto, pão, roupas e moral alta viram **sobrados** (mais moradores e
impostos), que consomem pão e roupas todo dia — faltando, a moral cai e eles regridem. A **Praça** melhora a moral das
casas em volta, e o **Mercado** compra e vende lotes de recursos por ouro (o preço piora a cada troca e volta ao normal
com o tempo).

**Mundo externo:** o mapa começa coberto pela **névoa de guerra** — só se vê o que unidades e edifícios
enxergam (batedores veem longe). Lá fora há **pontos de interesse**: ruínas para vasculhar (recursos), sobreviventes
para resgatar (viram aldeões), ninhos de titãs para destruir (de onde vêm titãs), jazidas de ferro valiosas e locais
de história com fragmentos sobre a origem dos titãs. Selecione unidades e clique com o botão direito no ponto para
mandá-las; o andamento aparece no painel. Tudo o que foi encontrado fica em **Descobertas**. Os **portões** abrem
quando alguém passa — e, abertos, deixam titãs entrar. Quem morre fica gravado no **Memorial**.

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

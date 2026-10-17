# PROMPT: Jogo "Mauern" — RTS / Tower Defense / City Builder com progresso contínuo

## Visão geral
Crie um jogo para navegador como um projeto **TypeScript + Vite + PixiJS**, organizado em módulos (ver seção 15). Nesta primeira versão, os gráficos são gerados por código (formas, cores e texturas procedurais desenhadas no PixiJS), sem arquivos de arte externos, mas a arquitetura deve permitir trocar por sprites reais no futuro. O gráfico é **2D, visto de cima (top-down)**.

O jogo se chama **Mauern** (alemão para "muralhas"). É um **RTS no estilo Age of Empires** misturado com city builder e tower defense, com inspiração temática em "Attack on Titan": um pequeno grupo de sobreviventes funda um povoado num mundo dominado por titãs gigantes e precisa crescer, se fortificar e proteger a cidade a qualquer custo.

Pilares do design:
1. **Não existem fases.** É uma única partida contínua e persistente. Tudo o que foi construído, conquistado e perdido fica no mundo para sempre. O progresso nunca é zerado.
2. **Começo humilde.** O jogador começa só com o mínimo para sobreviver e cresce aos poucos: de um acampamento de madeira até uma cidade cercada por muralhas colossais.
3. **Controle direto estilo RTS.** O jogador seleciona e comanda aldeões, soldados e edifícios diretamente.
4. **Proteger a cidade a qualquer custo**, com a opção arriscada de levar tropas para fora das defesas em missões.
5. **A jornada é o objetivo, não a vitória.** Não há como "ganhar" a partida. O prazer está em ver a cidade evoluir enquanto sobrevive. Cada era deve durar MUITAS horas e ter muito conteúdo. **Correr (rush) não pode ser possível nem vantajoso.**

## 1. Início da partida
O jogador começa com:
- 1 **Centro da Vila** (o coração da cidade: produz aldeões, recebe recursos e é o ponto de game over se for destruído).
- 4 **aldeões**.
- 1 **batedor a cavalo** (para explorar).
- Recursos iniciais: 200 comida, 150 madeira, 50 pedra, 0 ferro, 0 ouro.
- Uma área inicial com árvores, arbustos de frutas, animais de caça e uma pequena jazida de pedra perto do Centro da Vila. Os recursos melhores ficam mais longe.
- Nenhuma muralha. Os primeiros dias são calmos (poucos titãs pequenos e ocasionais), para que o jogador monte a economia básica antes da primeira ameaça real.

## 2. Controles (estilo RTS)
- **Botão esquerdo**: seleciona uma unidade ou edifício; arrastar cria uma caixa de seleção para várias unidades.
- **Shift + clique**: adiciona unidades à seleção ou enfileira ordens.
- **Duplo clique**: seleciona todas as unidades do mesmo tipo na tela.
- **Botão direito**: ordem contextual (mover, coletar recurso, atacar, construir/reparar, entrar em edifício, guarnecer muralha).
- **Ctrl + 1–9**: cria grupos de controle; **1–9** seleciona o grupo; apertar duas vezes centraliza a câmera nele.
- Atalhos: **H** seleciona o Centro da Vila, **. (ponto)** seleciona o próximo aldeão ocioso, **Espaço** pausa, **Delete** destrói o selecionado (com confirmação). Os edifícios têm atalhos para produzir unidades.
- Câmera: rolar empurrando o mouse para a borda da tela, WASD/setas, arrastar com o botão do meio e zoom com a roda.
- **Ponto de reunião**: edifícios de produção aceitam botão direito para definir onde as unidades novas vão (inclusive direto num recurso, para aldeões).
- Painel inferior estilo Age of Empires: retrato e status da seleção à esquerda, grade de comandos e construções à direita e fila de produção com barra de progresso.
- Pathfinding A* numa grade, com desvio de obstáculos e unidades que não se sobrepõem (separação simples).

## 3. Aldeões e economia
- Aldeões coletam fisicamente: andam até o recurso, coletam por alguns segundos, carregam uma quantidade limitada (ex.: 10) e voltam ao **ponto de entrega** mais próximo. Isso torna importante construir depósitos perto dos recursos.
- Recursos básicos:
  - **Comida**: frutas (rápido, acaba logo), caça, pesca, fazendas (renováveis, precisam ser replantadas e dependem da estação).
  - **Madeira**: árvores (que viram tocos quando acabam; podem ser replantadas a partir da Era II).
  - **Pedra**: jazidas.
  - **Ferro**: jazidas (mais raras; as boas ficam fora da área segura).
  - **Ouro**: impostos das casas e comércio no mercado.
  - **Gás** (a partir da Era III): refinado a partir de cristais encontrados no território externo. É combustível do equipamento de manobra 3D.
- **Bens produzidos** (cadeias de produção que crescem a cada era; ver seção 5):
  - Trigo → Moinho → Farinha → Padaria → Pão
  - Caça → Curtume → Couro → Selaria → Arreios / Cintos de manobra
  - Ferro → Fundição → Lingotes → Ferraria → Ferramentas, armas, lâminas
  - Lã/Linho → Tecelagem → Roupas
  - Cristais → Refinaria → Gás
  - Argila → Olaria → Tijolos / Telhas (melhora casas)
- **População**: casas aumentam o limite populacional. O limite cresce conforme as casas evoluem de nível (ver seção 5). Limite máximo alto (ex.: 500) para permitir uma cidade grande.
- Aldeões também constroem e reparam edifícios e muralhas. Vários aldeões juntos constroem mais rápido. Edifícios de produção exigem trabalhadores (aldeões designados).
- Aldeões ficam vulneráveis: podem fugir para dentro de edifícios (Centro da Vila, torres) ao soar o sino de alarme (botão no Centro da Vila), e aí ajudam a defender.
- Mostrar o contador de aldeões ociosos na interface.

## 4. Eras: progressão lenta, profunda e sem rush
Evoluir de era é uma **conquista da cidade, não uma corrida**. Não existe atalho nem vantagem em correr. Cada era precisa ter conteúdo suficiente para muitas horas de jogo.

### 4.1 Duração-alvo (em jogo contínuo na velocidade 1x)
- Era I (Refúgio): 2 a 3 horas.
- Era II (Vila): 4 a 6 horas.
- Era III (Fortaleza): 6 a 10 horas.
- Era IV (Grandes Muralhas): aberta, sem fim (é a fase de "jogo infinito" e de embelezar a cidade).
- Balancear custos, tempos de pesquisa e requisitos para respeitar essas durações.

### 4.2 Requisitos para avançar de era: marcos, não só recursos
Avançar exige cumprir uma lista de **marcos da cidade**. Recursos sozinhos nunca bastam. Um painel "Caminho para a Próxima Era" mostra o checklist com o progresso de cada item.

**Era I → II (exemplo)**
- Sobreviver pelo menos 20 dias.
- População de 30 habitantes.
- Vila totalmente cercada por paliçada (perímetro fechado).
- 10 casas no nível 2, 3 fazendas, moinho e depósitos.
- Pesquisar 8 das 12 tecnologias da Era I.
- Repelir 2 Grandes Ataques.
- Descobrir 5 pontos de interesse com o batedor.
- Recursos: 800 comida, 600 madeira, 300 pedra.

**Era II → III (exemplo)**
- Sobreviver pelo menos 50 dias.
- População de 100.
- Dois anéis de muro de pedra fechados.
- Cadeias de pão, couro e ferramentas funcionando.
- Moral acima de 60 por 5 dias seguidos.
- 3 expedições bem-sucedidas fora dos muros.
- **Encontrar nas ruínas externas os "Projetos do Equipamento de Manobra"** (item de história obrigatório: a tecnologia é redescoberta, não comprada).
- Pesquisar 12 das 18 tecnologias da Era II.

**Era III → IV (exemplo)**
- Sobreviver pelo menos 120 dias.
- População de 250.
- Um posto avançado ativo fora das muralhas.
- Abater um Titã Blindado.
- Estoque de 2000 de gás.
- **Recuperar os "Registros dos Construtores"** num local de história distante (conhecimento para erguer a Grande Muralha).
- Pesquisar 16 das 24 tecnologias da Era III.

Após cumprir os marcos, a pesquisa de evolução no Centro da Vila leva um tempo longo (ex.: 2 a 3 dias de jogo). Durante esse período, o **Desafio de Transição** acontece: um ataque mais forte que os titãs "atraídos pela agitação" fazem contra a cidade. Se o Centro da Vila for danificado demais, a pesquisa pausa.

### 4.3 Muito conteúdo por era
Cada era deve oferecer:
- **Árvore de tecnologias própria**: de 12 a 24 tecnologias por era, com tempos de pesquisa longos (de meio dia a vários dias de jogo). Algumas só são liberadas por itens encontrados fora dos muros.
- **Melhorias de edifícios**: cada edifício tem 3 níveis de melhoria dentro da era, com mudança visual.
- **Novos edifícios e cadeias de produção** a montar e equilibrar.
- **Novas necessidades dos cidadãos** (seção 5), que fazem a cidade precisar ser replanejada.
- **Crônicas da Era**: de 15 a 25 objetivos opcionais por era (ex.: "Abater 50 titãs com arqueiros", "Ter 5 fazendas no outono sem perder colheita", "Resgatar 20 sobreviventes", "Nenhum aldeão morto durante um Grande Ataque"). Recompensas: relíquias com bônus permanentes, decorações exclusivas e títulos para a cidade.
- **Capítulo de história**: cada era revela uma parte do mistério da origem dos titãs, através de locais de história no território externo.
- **Exploração escalonada**: o mapa é grande e os pontos de interesse ficam mais perigosos e valiosos quanto mais longe estão. Cada era permite alcançar áreas mais distantes (postos avançados, cavalos melhores, mais gás).

### 4.4 Ameaça em faixas por era (para o jogador poder curtir a cidade)
- Os titãs ficam mais fortes com os dias e com o tamanho da cidade, mas **dentro de uma faixa definida pela era**. A ameaça se estabiliza num patamar que a era consegue enfrentar com uma cidade bem planejada. O jogador não é punido por demorar e pode curtir a construção sem uma espiral de dificuldade.
- Os grandes saltos de dificuldade acontecem somente na transição de era (novos tipos de titã aparecem).
- Os Grandes Ataques periódicos e os eventos mantêm a tensão. Erros custam caro, mas raramente destroem tudo de uma vez.

### 4.5 Conteúdo de cada era
**Era I: Refúgio** (sobrevivência)
- Edifícios: Centro da Vila, Barraca/Casa, Depósito de Madeira, Depósito de Mineração, Moinho, Fazenda, Cabana de Caça, Poço, Paliçada de madeira, Portão de paliçada, Torre de vigia de madeira, Fogueira comunitária.
- Unidades: aldeão, batedor, miliciano (lança).
- Necessidades: comida e abrigo; depois água (poço).
- Titãs: só comuns pequenos (3–7 m).

**Era II: Vila**
- Edifícios: Quartel, Campo de Arqueiros, Estábulo, Ferraria, Fundição, Curtume, Padaria, Tecelagem, Olaria, Mercado, Capela, Praça, Muro de pedra, Portão de pedra, Torre de pedra, Hospital, Memorial, Estradas de pedra.
- Unidades: lanceiro, arqueiro, cavaleiro batedor, carroça de suprimentos.
- Necessidades: variedade de comida (pão), roupas, fé (capela), segurança (torres próximas).
- Titãs: comuns até 12 m e os primeiros anormais.

**Era III: Fortaleza**
- Edifícios: Academia Militar, Oficina de Manobra, Selaria, Refinaria de Gás, Canhoneira, Muralha alta, Posto avançado (fora dos muros), Universidade, Taverna, Casa de banhos.
- Unidades: **soldado com equipamento de manobra 3D** (unidade principal contra titãs), operador de canhão, balista de arpão.
- Necessidades: saúde (hospital e banhos), lazer (taverna), ferramentas.
- Titãs: até 15 m, rastejantes, anormais frequentes, Titã Blindado (evento).

**Era IV: Grandes Muralhas**
- Edifícios: **Grande Muralha** (muralhas colossais de 50 m, caras e demoradas), canhões sobre trilhos na muralha, Quartel-General da Tropa de Exploração, Castelo, Teatro, Biblioteca, Monumentos e decorações grandes.
- Unidades: soldados de elite (veteranos promovidos), esquadrão de capitão, lança-trovão (arma explosiva).
- Necessidades: cultura (teatro, biblioteca) e luxo (bens raros vindos de fora dos muros).
- Titãs: todos os tipos e o Titã Colossal (evento de crise).

## 5. Cidadãos, casas e necessidades
- As casas evoluem de nível automaticamente quando as necessidades da vizinhança são atendidas (raio de alcance de poços, mercados, capelas etc.): Barraca → Casa de madeira → Casa de pedra → Sobrado → Casarão.
- Cada nível aumenta a população abrigada e os impostos, e muda o visual.
- Se as necessidades deixam de ser atendidas, a casa regride e a moral cai.
- Isso cria um quebra-cabeça urbano contínuo: planejar bairros, ruas, alcance de serviços e espaço dentro das muralhas (que é limitado e precioso).
- **Estradas** aumentam a velocidade das unidades. **Decorações** (jardins, estátuas, fontes) aumentam a moral e a atratividade dos bairros.

## 6. Estações e eventos
- **Estações do ano** (ex.: 10 dias de jogo cada): primavera (plantio), verão (colheita cresce), outono (colheita farta), inverno (fazendas param, consumo de madeira para aquecimento, titãs mais lentos). Isso cria um ritmo de planejamento: estocar antes do inverno.
- **Eventos aleatórios da cidade**: incêndio (se espalha entre casas de madeira), doença (exige hospital), caravana de refugiados pedindo abrigo, colheita farta, tempestade, festival (gasta comida e dá moral), desertor que traz informações de uma ruína, mercador viajante com itens raros.
- Os eventos aparecem como cartas com escolhas e consequências.

## 7. Muralhas e expansão territorial
- O jogador constrói suas próprias muralhas segmento por segmento: clica e arrasta para traçar a linha, e os aldeões constroem. Elas evoluem: paliçada de madeira → muro de pedra → muralha alta → Grande Muralha. É possível fazer upgrade de segmentos existentes.
- Portões abrem automaticamente para unidades do jogador e podem ser trancados manualmente. São pontos fracos.
- Soldados e arqueiros podem **guarnecer** muralhas e torres, atacando de cima com bônus.
- **Expansão em anéis**: a cidade cresce construindo novos anéis de muralhas cada vez maiores. Fazendas e casas só produzem com eficiência total dentro de um perímetro fechado por muralhas (o jogo detecta áreas totalmente cercadas com flood fill). Isso incentiva a fortificar antes de expandir.
- Segmentos destruídos viram **brechas**. Os titãs entram por elas e é preciso reconstruir.

## 8. Titãs (inimigos)
- Vêm das bordas do mapa e vagam pelo território externo. Vão em direção aos humanos e às construções mais próximas, batem nas muralhas até abrir uma brecha e, ao entrar, destroem edifícios e devoram aldeões.
- Tipos:
  - **Titã Comum** (3–15 m): o tamanho determina vida, dano e quais muralhas consegue derrubar ou escalar.
  - **Titã Anormal**: movimento errático, corre, pula e mira alvos específicos ignorando o mais próximo.
  - **Titã Rastejante**: baixo e rápido.
  - **Titã Colossal** (evento raro de crise): maior que muralhas comuns e capaz de chutar portões.
  - **Titã Blindado** (evento): resiste a flechas e canhões; só cai com golpes na nuca de soldados de elite.
- **Ponto fraco**: golpe na nuca mata instantaneamente. Soldados com equipamento de manobra 3D tentam esse golpe, com chance baseada em habilidade. Flechas e canhões causam dano normal e podem atordoar.
- Titãs mortos evaporam (vapor branco). Titãs não mortos permanecem no mundo.
- Ciclo dia/noite: de dia os titãs ficam ativos; à noite a maioria fica lenta ou dormente (exceto anormais). A noite é o momento de reparar e construir.
- A dificuldade segue as faixas por era da seção 4.4. Grandes Ataques periódicos (ex.: a cada 7 dias) são anunciados com antecedência pelas torres de vigia.

## 9. Soldados
- Cada unidade militar é um indivíduo com **nome gerado**, nível, experiência, contagem de abates e atributos (Força, Agilidade, Técnica, Coragem). Veteranos ganham títulos e podem ser promovidos a elite.
- Soldados com equipamento de manobra 3D se movem rápido e "voam" de forma ágil ao redor dos titãs, presos a edifícios, muralhas e árvores (em campo aberto lutam pior). Gastam gás e lâminas e precisam reabastecer num depósito, numa carroça de suprimentos ou num posto avançado.
- Feridos vão ao Hospital. Mortos são permanentes e registrados no **Memorial** com nome, dia, causa da morte e abates.
- Formações para grupos selecionados: linha, coluna, círculo defensivo e formação de batedores de longo alcance.

### 9.1 Tropa de Manobra (Omni-directional Mobility Gear) — planejado
Unidade de elite da Era III, a principal arma contra titãs. Decisões já combinadas:
- **Movimento por ancoragem**: os ganchos precisam de pontos altos — árvores, edifícios, torres e muralhas. Perto deles a tropa é muito rápida e "salta" de ponto em ponto em vez de andar; em campo aberto fica lenta (ou só anda a pé). Florestas e cidades viram vantagem tática; atravessa rios (água rasa e funda) se houver onde ancorar dos dois lados.
- **Gás e lâminas**: recursos consumidos no voo (gás) e nos golpes (lâminas). Acabando, a unidade precisa reabastecer num edifício novo (oficina/arsenal), numa carroça de suprimentos ou num posto avançado. Dá peso estratégico a cada saída.
- **Golpe na nuca**: ataque especial que pode matar o titã de uma vez (chance maior com nível alto e titãs menores); errar expõe a unidade a ser agarrada pelo titã.
- **Era e custo**: liberada na Era III (Oficina de Manobra + Refinaria de Gás), depois do miliciano; treino caro e demorado.
- **Visual**: cabos esticados até o ponto de ancoragem durante o voo, rastro de gás e a unidade em arco no ar.
- **Integração com o que já existe**: usa experiência, patentes, batalhões e formações, honras, nobreza, lendas, hospital e a altura/vida dos titãs.

## 10. Missões fora das muralhas
- Não existe tela separada: as expedições acontecem no mesmo mapa, em tempo real. O jogador seleciona tropas, carroças de suprimentos e aldeões, passa pelo portão e os comanda diretamente lá fora (estilo RTS).
- **Abrir o portão é um risco**: titãs próximos podem entrar enquanto ele está aberto.
- **O dilema**: tropas fora não estão defendendo a cidade.
- Objetivos espalhados pelo território externo (revelados pela névoa de guerra):
  - **Ruínas**: saquear recursos raros (ferro, cristais de gás, tecnologias perdidas).
  - **Sobreviventes isolados**: escoltá-los até a cidade para virarem aldeões.
  - **Ninhos de titãs**: limpar uma região para reduzir a infestação.
  - **Locais para postos avançados**: construir uma base fortificada fora dos muros para reabastecer e estender o alcance.
  - **Jazidas valiosas**: só disponíveis lá fora; exigem escolta para os aldeões.
  - **Locais de história**: documentos e ruínas que revelam a origem dos titãs. Alguns contêm itens obrigatórios para avançar de era.
- Sinalizadores: botões para disparar sinal verde (mudar direção), vermelho (titã avistado) e preto (anormal), que afetam o comportamento automático das tropas.
- O retorno com sucesso aumenta a moral da cidade; as baixas diminuem.

## 11. Moral
- A moral da cidade sobe com vitórias, expedições bem-sucedidas, necessidades atendidas, decorações e festivais. Cai com mortes, edifícios destruídos, fome, frio e titãs dentro dos muros.
- Moral alta dá bônus de coleta e coragem. Moral baixa causa lentidão, deserções e, em casos extremos, revoltas.

## 12. Persistência (OBRIGATÓRIO)
- Salvar automaticamente o estado COMPLETO no **IndexedDB** (o localStorage tem limite de ~5 MB, insuficiente para uma cidade grande) a cada 30 segundos e ao fechar a aba: mapa e seed, recursos naturais restantes, todos os edifícios (posição, nível, vida, trabalhadores, fila de produção), segmentos de muralha, todas as unidades com atributos e ordens, estoques de bens, nível de cada casa, memorial, titãs vivos, névoa de guerra revelada, era atual e progresso dos marcos, tecnologias pesquisadas, crônicas concluídas, relíquias, itens de história, estação, dia e hora.
- Ao abrir o jogo, carregar automaticamente e continuar exatamente de onde parou.
- Exportar e importar o save em .json. "Nova Cidade" fica num menu, com confirmação dupla.
- O save tem número de versão e funções de migração, para que saves antigos continuem funcionando conforme o jogo for atualizado (essencial numa partida que dura meses).
- Manter os 3 últimos autosaves em rotação, para recuperar o jogo se um save corromper.
- **Game over** só acontece se o Centro da Vila (e todos os Castelos, se houver) cair. Opção "Refundar": recomeçar no mesmo mundo com as ruínas e o memorial da cidade anterior.
- Estatísticas da cidade ao longo do tempo (população, titãs abatidos, mortes, dias sobrevividos), com gráfico simples para o jogador ver sua evolução.

## 13. Interface
- Barra superior: recursos, população/limite, era atual, estação, dia e hora, moral, indicador de próximo Grande Ataque.
- Painel inferior (estilo Age of Empires): seleção, comandos, construções e filas.
- Painéis acessíveis por botões e atalhos: Caminho para a Próxima Era, Tecnologias, Crônicas, Cidadãos/Necessidades (com overlay no mapa mostrando o alcance dos serviços), Produção, Memorial, Estatísticas.
- Minimapa clicável: terreno, muralhas, unidades (azul), titãs avistados (vermelho), alertas piscando.
- Notificações: "Muralha sob ataque!" (clicar leva a câmera até lá), "Aldeão sendo atacado", "Pesquisa concluída", "Casa evoluiu".
- Diário de eventos rolável.
- Sons gerados com Web Audio API: sino de alarme, corneta, golpes, construção.
- Controle de velocidade: pausa, 1x, 2x e 3x.

## 14. Estilo visual (2D top-down)
- Visão de cima com leve sombra nos objetos para dar volume. O terreno é desenhado em grade (grama, terra, floresta, água, rocha) com variação de cor para não ficar repetitivo; a cor muda com as estações (neve no inverno).
- Edifícios com telhados vistos de cima (vermelho e marrom), cuja aparência muda conforme o nível e a era.
- Aldeões e soldados pequenos, com cor do jogador e indicador do que carregam. Soldados de manobra deixam um rastro fino dos cabos.
- Titãs grandes, de cor de pele pálida, com balanço de caminhada e sombra proporcional ao tamanho.
- Iluminação dia/noite com overlay escurecido e luz em volta de tochas e torres à noite.
- Efeitos: vapor dos titãs, fumaça de canhão, poeira de muralha, flechas em arco, fumaça das chaminés.
- Performance: centenas de entidades (meta: 500+ unidades a 60 FPS), com renderização em WebGL via PixiJS, passo fixo de simulação, culling fora da tela e grade espacial para colisões.

## 15. Arquitetura técnica
- **Stack**: TypeScript (modo strict), Vite, PixiJS v8 para renderização, IndexedDB (via biblioteca leve como `idb`) para saves, Vitest para testes. A interface (painéis, menus, HUD) pode ser feita em HTML/CSS sobreposto ao canvas.
- **Separação simulação × renderização**: a lógica do jogo roda em passo fixo (ex.: 20 ticks por segundo) e não depende do PixiJS. A renderização apenas lê o estado e interpola. Isso permite testar a simulação sem navegador, acelerar o tempo e salvar o estado limpo.
- **Estado serializável**: todo o estado do mundo vive em estruturas de dados simples (sem referências circulares; entidades referenciadas por ID), para que o save seja direto.
- **Aleatoriedade com seed** (PRNG próprio), para que o mapa e os eventos sejam reproduzíveis.
- **Dados separados do código**: edifícios, unidades, tecnologias, eras, marcos, crônicas, eventos e tipos de titã definidos em arquivos de dados em `src/data/`. Todos os números de balanceamento ficam centralizados em `src/data/balance.ts`.
- **Estrutura de pastas sugerida**:
  ```
  src/
    main.ts
    core/        (game loop, tempo, PRNG, event bus)
    world/       (mapa, terreno, geração procedural, névoa de guerra, estações)
    pathfinding/ (A*, grade de navegação, detecção de áreas cercadas)
    entities/    (unit, villager, soldier, titan, building, house, wall)
    systems/     (economia, produção, necessidades, combate, moral, eras, marcos, tecnologia, crônicas, eventos, expedições, IA dos titãs)
    render/      (camadas PixiJS, câmera, efeitos, iluminação dia/noite)
    input/       (seleção, comandos, atalhos)
    ui/          (HUD, painéis, minimapa, notificações, diário)
    audio/       (sons gerados com Web Audio API)
    save/        (IndexedDB, versões, migrações, exportar/importar)
    data/        (definições e balance.ts)
  tests/
  ```
- **Ferramentas de desenvolvimento** (desligadas no modo normal): painel de debug com velocidade até 10x, adicionar recursos, gerar titãs, revelar o mapa e pular para um dia, para testar o balanceamento de eras longas.
- Tutorial contextual nos primeiros minutos (pode ser desligado).

## 16. Roteiro de desenvolvimento (em etapas jogáveis)
Construir o jogo em incrementos, cada um jogável e testado antes do próximo:
1. **Base**: projeto Vite/TS/PixiJS, mapa procedural, câmera, game loop e save/load funcionando desde o início.
2. **RTS básico**: seleção, comandos, pathfinding, aldeões coletando e entregando recursos, construção de edifícios da Era I e população.
3. **Ameaça**: titãs comuns, ciclo dia/noite, combate, paliçadas, portões, torres, guarnição, brechas e reparo.
4. **Era I completa**: casas evoluindo, necessidades, estações, tecnologias da Era I, marcos, crônicas e Grandes Ataques. Balancear para 2–3 horas.
5. **Mundo externo**: névoa de guerra, pontos de interesse, expedições, sobreviventes, soldados nomeados e memorial.
6. **Era II**: cadeias de produção, muros de pedra, novas unidades e necessidades, titãs anormais e eventos em cartas.
7. **Era III**: equipamento de manobra 3D (ver 9.1), gás, canhões, postos avançados, Titã Blindado.
8. **Era IV**: Grande Muralha, elite, Titã Colossal, cultura, decorações e estatísticas.
9. **Polimento contínuo**: sons, efeitos, balanceamento e qualidade de vida.

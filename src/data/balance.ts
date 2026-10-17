// Todos os números de balanceamento do jogo ficam centralizados aqui.

export const BALANCE = {
  world: {
    width: 256, // em tiles
    height: 256,
    tileSize: 32, // em pixels de mundo
    startClearRadius: 9, // área livre ao redor do Centro da Vila
  },
  time: {
    ticksPerSecond: 20,
    secondsPerDay: 240, // duração de um dia de jogo em segundos reais (velocidade 1x)
    daysPerSeason: 10,
    startHour: 7,
    dawnHour: 5,
    duskHour: 19,
  },
  start: {
    resources: { food: 200, wood: 150, stone: 50, iron: 0, gold: 0 },
    villagers: 4,
    scouts: 1,
  },
  resources: {
    treeWood: 100,
    berryFood: 120,
    stoneAmount: 300,
    ironAmount: 400,
    crystalAmount: 250,
  },
  population: {
    max: 300,
  },
  units: {
    nodeSearchRadius: 12, // raio (tiles) para achar outro recurso igual quando um acaba
    dropsiteSearchRadius: 60, // raio (tiles) em volta do depósito para escolher o próximo recurso
    maxGatherersPerNode: 3, // aldeões coletando o mesmo recurso ao mesmo tempo
    autoTaskRadius: 10, // raio para tarefas automáticas após construir
    maxTrainQueue: 10, // lotes na fila de um edifício
    maxBatch: 3, // unidades militares treinadas juntas num lote (aldeões: sempre 1)
    batchExtraTime: 0.8, // cada unidade extra do lote soma 80% do tempo de uma unidade
  },
  // Névoa de guerra: raio de visão em tiles.
  fog: {
    startRadius: 18, // área já conhecida no começo da partida
    updateTicks: 10, // a visão é recalculada a cada 10 passos (0,5 s)
    sight: { villager: 6, scout: 12, militia: 7, spearman: 7, archer: 9 } as Record<string, number>,
    buildingSight: 6,
    buildingSightByKind: { townCenter: 11, watchTower: 13, stoneTower: 15 } as Record<string, number>,
  },
  // Pontos de interesse fora dos muros.
  pois: {
    minDistance: 34, // tiles do centro: só lá fora
    spacing: 18, // distância mínima entre dois pontos
    count: { ruins: 6, survivors: 4, nest: 3, deposit: 3, lore: 4 } as Record<string, number>,
    interactRadius: 2, // tiles: perto disso a unidade age no ponto
    ruinsSearchSeconds: 12,
    ruinsLoot: [
      { iron: 120, stone: 80 },
      { gold: 90, iron: 40 },
      { food: 250, wood: 150 },
      { gold: 60, stone: 150 },
    ] as Partial<Record<'food' | 'wood' | 'stone' | 'iron' | 'gold', number>>[],
    survivorsMin: 2,
    survivorsMax: 4,
    nestGuards: 2, // titãs que aparecem ao descobrir um ninho
    nestClearSeconds: 15, // soldados no ninho, sem titãs por perto, por este tempo
    nestClearRadius: 10, // tiles: nenhum titã a esta distância para limpar
    nestSpawnShare: 0.35, // chance de um titã avulso surgir num ninho ativo (em vez da borda)
    depositNodes: 7, // jazidas de ferro na jazida valiosa
    depositAmountMult: 3, // cada uma com 3× o ferro normal
    loreReadSeconds: 10,
    successMorale: 6, // moral por missão cumprida fora dos muros (por 1 dia)
  },
  // Nobreza: título concedido a soldados de nível alto.
  nobility: {
    minLevel: 70,
    costStep: 500, // ouro: o 1º nobre custa 500, o 2º 1000, o 3º 1500... (conta os nobres vivos)
    upkeepGold: 40, // ouro por dia, por nobre
    unpaidMorale: -8, // moral quando não há ouro para pagar os nobres (por 1 dia)
    leadershipBonus: 0.1, // +10% fixo no bônus de comando (e o nobre comandante recebe o bônus total)
    battalionSpeed: 0.05, // +5% de velocidade para o batalhão do nobre
    auraBonus: 0.05, // +5% de vida e ataque para os militares perto (não acumula entre nobres)
    auraRadius: 8, // tiles
    trainerXp: 5, // treinador nobre: +5 de experiência por segundo para os alunos e para si
    extraHp: 50, // vida base extra
    lanceDamage: 5, // lança dourada: +5 de dano base
    deathMorale: -25, // morte de um nobre (por 4 dias)
  },
  // Honras: uma a cada 10 titãs abatidos pelo soldado.
  honor: {
    killsPerHonor: 10,
    max: 10,
    bonusPerHonor: 0.02, // +2% de vida e ataque por honra
    maxBonus: 0.3, // com 10 honras, +30% no total
  },
  // Lenda: soldados que chegam ao nível 100.
  legend: {
    auraBonus: 0.1, // +10% de vida e ataque para os militares perto (não acumula entre lendas)
    radius: 10, // tiles: aura e intimidação
    titanHpReduction: 0.05, // titãs intimidados: -5% de vida base (o dano recebido conta 1/0,95)
    titanDamageReduction: 0.1, // e -10% de dano
    shield: 30, // escudo da lenda
    shieldRecharge: 20, // segundos fora de combate para recarregar
    battalionShield: 10, // escudo dos militares no batalhão da lenda
    battalionShieldRecharge: 60,
    trainerXp: 5, // treinador lenda: +5 de experiência por segundo para os alunos
  },
  hospital: {
    bedsPerLevel: 20, // leitos por nível (nível máximo 5 = 100 leitos)
    maxLevel: 5,
    maxDoctors: 3, // no nível 1; cada nível acima libera mais 1 vaga de médico
    healPerSecond: 1.5, // vida curada por segundo, por médico
    upgradeCost: { wood: 100, stone: 60, gold: 20 }, // multiplicado pelo nível de destino
    upgradeSeconds: 60, // multiplicado pelo nível de destino
    criticalHp: 0.3, // abaixo de 30% de vida a unidade está em estado crítico
    groupRadius: 5, // tiles: o batalhão espera os membros chegarem perto antes de entrar junto
  },
  refuge: {
    fleeRadius: 7, // tiles: aldeões fogem quando um titã chega a essa distância
    terrorSeconds: 60, // duração do terror (segundos de jogo na velocidade 1x)
    guardBonusPerLevel: 0.05, // cada nível do guarda faz o terror passar 5% mais rápido
    runAwayTiles: 10, // sem abrigo com vaga, o aldeão corre essa distância para longe do titã
  },
  titans: {
    firstSpawnDay: 3, // os primeiros dias são calmos
    // Intervalo entre aparições (em horas de jogo): começa longo e diminui com os dias,
    // até um piso definido pela era (faixa de ameaça).
    startIntervalHours: 22,
    intervalDecayPerDay: 0.6,
    minIntervalHours: 5,
    maxAlive: 16,
    minHeight: 3,
    maxHeightByEra: [7, 12, 15, 15],
    heightGrowthPerDay: 0.15, // o tamanho máximo sorteado cresce com os dias (até o teto da era)
    hpPerMeter: 55,
    damagePerMeter: 5,
    buildingDamageFactor: 0.5, // contra construções os titãs são mais lentos: a ameaça maior é às pessoas
    attackCooldown: 2.2,
    speedBase: 22,
    speedPerMeter: 2,
    nightSpeedFactor: 0.25, // à noite os titãs ficam lentos e quase dormentes
    regenPerSecond: 0.5,
    sightRadius: 10, // em tiles: a partir daí perseguem humanos e edifícios
    spawnMinDistance: 85, // distância mínima do centro do mapa para surgir
    retargetSeconds: 2,
    repathSeconds: 1.5,
    wallCostBase: 6, // custo de atravessar uma estrutura no pathfinding (incentiva contornar)
    wallCostPerHp: 1 / 40, // estruturas mais fortes custam mais: os titãs procuram o ponto fraco
    forestCost: 3,
    gateOpenSeconds: 3, // o portão fica aberto por este tempo depois que alguém passa (titãs podem entrar)
    // Anormais (Era II em diante): imprevisíveis.
    abnormal: {
      chance: 0.15, // dos titãs que surgem
      hpMult: 1.25,
      damageMult: 1.15,
      speedMult: 1.6,
      retargetMin: 2, // segundos entre trocas de alvo
      retargetMax: 5,
      buildingFixation: 0.45, // chance de ignorar humanos e correr atrás de um edifício
    },
    wadeMinHeight: 4, // titãs a partir desta altura (m) atravessam água rasa
    shallowCost: 3, // custo de caminho na água rasa (evitam, mas cruzam se compensar)
    shallowSpeedFactor: 0.5, // velocidade dentro da água rasa
    greatAttackEveryDays: 7,
    greatAttackBase: 3,
    greatAttackPerWeek: 1,
    greatAttackMaxByEra: [6, 10, 14, 18], // a horda para de crescer num teto definido pela era
    greatAttackHour: 9,
    sightAlertRadius: 30, // tiles de qualquer edifício: avisa que um titã foi avistado
  },
  combat: {
    archerGarrisonFactor: 1, // arqueiro abrigado numa torre soma este tanto do próprio ataque a cada flecha
    meleeReach: 20, // alcance extra (px) do golpe humano além dos raios
    titanReach: 10,
    autoAttackRadius: 6, // tiles: milicianos atacam titãs que chegam a essa distância
    repairRateFactor: 0.75, // reparo: fração da velocidade de construção
    alarmRadius: 30, // tiles: aldeões que atendem ao sino
  },
  city: {
    foodPerPersonPerDay: 3.5, // consumo de comida por habitante
    winterWoodPerHouseLevel: 1.5, // lenha por dia de inverno, por nível de casa
    houseHousing: [5, 7, 10], // moradores por nível de casa (1 a 3)
    houseTaxPerDay: [0, 2, 5], // ouro por dia por nível de casa
    houseLevelNames: ['Barraca', 'Casa de madeira', 'Casa de pedra'],
    level3StoneCost: 25, // pedra gasta para virar casa de pedra
    upgradeHours: 2, // horas seguidas com as necessidades atendidas para evoluir
    downgradeHours: 12, // horas seguidas sem uma necessidade para regredir
    wellRadius: 7, // alcance do poço, em tiles
    bonfireRadius: 9,
    level3Morale: 50, // moral mínima para casas de pedra
    // Produção das fazendas por estação (primavera, verão, outono, inverno).
    farmSeasonMultiplier: [1, 1.25, 1.4, 0],
  },
  morale: {
    start: 60,
    base: 50,
    changePerHour: 2, // velocidade com que a moral se aproxima do valor-alvo
    wellFed: 10, // estoque de comida para 2 dias ou mais
    starving: -30,
    cold: -20, // sem lenha no inverno
    perHouseLevel: 7, // por nível médio das casas acima de 1
    bonfireCoverage: 8, // todas as casas perto de uma fogueira
    deathPenalty: -4, // por morte, some em 2 dias
    titanKillBonus: 1, // por titã abatido, some em 1 dia
    hordeRepelledBonus: 10,
    modifierCap: 30,
    workMin: 0.8, // multiplicador de trabalho com moral 0
    workMax: 1.2, // com moral 100
  },
  events: {
    firstDay: 4,
    minDaysBetween: 2,
    maxDaysBetween: 4,
  },
  era: {
    newEraMorale: 15, // moral ao chegar a uma nova era (por 3 dias)
    // Marcos para avançar da Era I para a Era II.
    toVila: {
      days: 20,
      population: 30,
      level2Houses: 10,
      techs: 8,
      greatAttacksRepelled: 2,
      titansKilled: 15,
      cost: { food: 800, wood: 600, stone: 300 },
    },
  },
  soldiers: {
    hpPerLevel: 0.015, // +1,5% de vida por nível
    attackPerLevel: 0.03, // +3% de ataque por nível
    xpPerDamage: 1, // experiência por ponto de dano causado a um titã
    xpPerKillPerMeter: 20, // abate: 20 de experiência por metro do titã
    battalionShareOfKill: 0.5, // o resto do batalhão divide metade do bônus de abate
    // Campo de treinamento
    trainingCapacity: 8, // alunos por campo (além do treinador)
    trainingXpPerSecond: 1.2,
    trainerBonusPerLevel: 0.05, // cada nível do treinador acelera o treino em 5%
    aboveTrainerFactor: 0.25, // aluno no nível do treinador (ou acima) aprende a 25% da velocidade
    trainerShare: 0.35, // o treinador ganha 35% da experiência que ensina
    // Batalhões
    battalionBase: 2, // soldados (além do comandante) com comandante nível 1
    battalionPerLevels: 4, // +1 vaga a cada 4 níveis do comandante
    defendRadius: 18, // tiles em volta do ponto de defesa
    huntRadius: 90, // tiles: até onde o batalhão procura titãs
    formationSpacing: 20, // px entre soldados na formação
    leadershipPerLevel: 0.005, // bônus de comando: +0,5% de ataque e vida por nível do comandante
    leadershipRadius: 8, // tiles: o bônus só vale perto do comandante
    formationLooseTiles: 0.8, // algum soldado fora do lugar na formação: o comandante anda a 70%
    formationLoosePace: 0.7,
    formationRegroupTiles: 4, // muito fora do lugar: o comandante anda a 35% até reagrupar
    formationRegroupPace: 0.35,
    engageTiles: 7, // titã a esta distância do comandante: o batalhão sai da formação e ataca
    engageReleaseTiles: 12, // já atacando, só volta à formação se o titã se afastar além disto
    formationUnlockLevel: 40, // comandante a partir deste nível escolhe a formação
    huntXpPerLevels: 20, // modo caçar: +1 de experiência por segundo a cada 20 níveis do comandante
  },
  camera: {
    minZoom: 0.35,
    maxZoom: 2,
    keyPanSpeed: 900, // pixels de tela por segundo
    edgePanSpeed: 800,
    edgePanMargin: 12,
  },
  save: {
    autosaveSeconds: 30,
    rotation: 3,
  },
  speeds: [0, 1, 2, 3],
  debugSpeeds: [5, 10],
  log: {
    maxEntries: 200,
  },
} as const;

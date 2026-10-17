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
    autoTaskRadius: 10, // raio para tarefas automáticas após construir
    maxTrainQueue: 10, // lotes na fila de um edifício
    maxBatch: 3, // unidades militares treinadas juntas num lote (aldeões: sempre 1)
    batchExtraTime: 0.8, // cada unidade extra do lote soma 80% do tempo de uma unidade
  },
  hospital: {
    bedsPerLevel: 20, // leitos por nível (nível máximo 5 = 100 leitos)
    maxLevel: 5,
    maxDoctors: 3,
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
    greatAttackEveryDays: 7,
    greatAttackBase: 3,
    greatAttackPerWeek: 1,
    greatAttackMaxByEra: [6, 10, 14, 18], // a horda para de crescer num teto definido pela era
    greatAttackHour: 9,
    sightAlertRadius: 30, // tiles de qualquer edifício: avisa que um titã foi avistado
  },
  combat: {
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

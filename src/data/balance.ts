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
    maxTrainQueue: 10,
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
    greatAttackPerWeek: 2,
    greatAttackMax: 10,
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

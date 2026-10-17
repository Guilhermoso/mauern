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
    townCenterHousing: 5,
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

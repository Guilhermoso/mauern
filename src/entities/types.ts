// Estruturas de dados das entidades. São objetos simples e serializáveis,
// referenciados por ID (sem referências circulares) para facilitar o save.

export type ResourceKind = 'food' | 'wood' | 'stone' | 'iron' | 'gold';
export type Resources = Record<ResourceKind, number>;

export type ResourceNodeKind = 'tree' | 'berries' | 'stone' | 'iron' | 'crystal';

export interface ResourceNode {
  id: number;
  kind: ResourceNodeKind;
  tx: number;
  ty: number;
  amount: number;
  variant: number; // variação visual estável
}

export type BuildingKind =
  | 'townCenter'
  | 'house'
  | 'lumberCamp'
  | 'miningCamp'
  | 'mill'
  | 'farm'
  | 'palisade'
  | 'gate'
  | 'watchTower'
  | 'well'
  | 'bonfire'
  | 'trainingGround'
  | 'refuge'
  | 'hospital'
  // Era II
  | 'barracks'
  | 'archeryRange'
  | 'stoneWall'
  | 'stoneGate'
  | 'stoneTower';

export interface TrainItem {
  kind: UnitKind;
  count: number; // unidades no lote (treinadas juntas)
  progress: number; // segundos já treinados
}

export interface RallyPoint {
  tx: number;
  ty: number;
  nodeId?: number; // se o ponto de reunião for um recurso, os aldeões vão coletá-lo
}

export interface Building {
  id: number;
  kind: BuildingKind;
  tx: number; // canto superior esquerdo, em tiles
  ty: number;
  hp: number;
  built: boolean;
  progress: number; // segundos de construção já feitos
  queue: TrainItem[];
  rally: RallyPoint | null;
  farmerId: number; // fazendas: aldeão que trabalha nela (0 = nenhum)
  attackCooldown: number; // segundos até a próxima flecha
  level: number; // casas: 1 a 3
  needHours: number; // casas: horas seguidas com as necessidades do próximo nível atendidas
  missingHours: number; // casas: horas seguidas sem as necessidades do nível atual
  research: { tech: string; progress: number } | null;
  trainerId: number; // campo de treinamento: soldado que comanda o treino (0 = nenhum)
  guardId: number; // campo de refúgio: soldado no posto (0 = nenhum)
  doctorIds: number[]; // hospital: aldeões designados como médicos
  upgradeProgress: number; // segundos de ampliação já feitos (-1 = não está ampliando)
  ruined: boolean; // muros de pedra destruídos viram escombros (passáveis) até serem reconstruídos
}

export type UnitKind = 'villager' | 'scout' | 'militia' | 'spearman' | 'archer';

export interface Carry {
  kind: ResourceKind;
  amount: number;
}

export type GatherPhase = 'collect' | 'drop';

export type UnitOrder =
  | { type: 'idle' }
  | { type: 'move'; tx: number; ty: number }
  // tx/ty: última posição conhecida do recurso, para procurar outro igual por perto quando ele acabar
  | { type: 'gather'; nodeId: number; nodeKind: ResourceNodeKind; tx: number; ty: number; phase: GatherPhase; avoid: number[] }
  | { type: 'farm'; buildingId: number; phase: GatherPhase }
  | { type: 'build'; buildingId: number }
  | { type: 'deliver'; buildingId: number }
  | { type: 'attack'; titanId: number }
  | { type: 'garrison'; buildingId: number }
  | { type: 'train'; buildingId: number }
  | { type: 'follow' } // membro de batalhão seguindo o comandante em formação
  | { type: 'flee'; buildingId: number; tx: number; ty: number }; // fugindo de um titã (para um abrigo ou para longe)

export interface Unit {
  id: number;
  kind: UnitKind;
  name: string;
  x: number; // em pixels de mundo
  y: number;
  hp: number;
  facing: number; // ângulo em radianos
  order: UnitOrder;
  path: number[]; // waypoints (índices de tile) ainda a percorrer
  pathKey: string; // destino para o qual o caminho foi calculado
  pathComplete: boolean; // false se o caminho só chega perto do destino
  carry: Carry | null;
  work: number; // acumulador de trabalho (coleta)
  moving: boolean;
  garrison: number; // edifício onde está abrigada (0 = fora)
  attackCooldown: number;
  prevOrder: UnitOrder | null; // ordem a retomar quando o sino de alarme for desligado
  level: number; // soldados: 1 a 100
  xp: number; // experiência acumulada no nível atual
  battalion: number; // batalhão ao qual pertence (0 = avulso)
  speedCap: number; // velocidade máxima imposta pelo batalhão (0 = sem limite)
  terror: number; // segundos de terror restantes (aldeões que fugiram de um titã)
  noble: boolean; // soldados: recebeu título de nobreza
  kills: number; // soldados: titãs abatidos (a cada 10, uma honra)
  shield: number; // escudo atual (lendas e o batalhão de uma lenda)
  lastCombatTick: number; // último tick em que atacou ou foi atingido
  speedBonus: number; // bônus de velocidade dado pelo batalhão (0,05 = +5%)
}

export type BattalionMode = 'manual' | 'defend' | 'hunt';

// Formações (escolhíveis com comandante a partir do nível 40).
export type Formation = 'block' | 'line' | 'column' | 'wedge' | 'circle';

export type BattalionOrder =
  | { type: 'idle' }
  | { type: 'move'; tx: number; ty: number }
  | { type: 'attack'; titanId: number }
  | { type: 'hospital'; buildingId: number }; // marchando para o hospital, para entrar todos juntos

export interface Battalion {
  id: number;
  name: string;
  commanderId: number;
  memberIds: number[]; // sem o comandante
  mode: BattalionMode;
  order: BattalionOrder;
  guard: { tx: number; ty: number } | null; // modo defender: ponto a proteger
  patrol: { tx: number; ty: number } | null; // modo caçar: destino da busca
  criticalIds: number[]; // unidades que, em estado crítico, mandam o batalhão ao hospital
  autoHospital: boolean; // corre sozinho para o hospital em estado crítico
  inHospital: number; // hospital onde o batalhão está internado (0 = nenhum)
  formation: Formation;
}

export type TitanKind = 'common' | 'abnormal';

export interface Titan {
  id: number;
  kind: TitanKind;
  height: number; // em metros; define vida, dano, tamanho e velocidade
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: number;
  targetKind: 'unit' | 'building' | 'march' | 'none';
  targetId: number;
  path: number[];
  pathKey: string;
  repathTick: number; // não recalcula o caminho antes deste tick
  retargetTick: number;
  attackCooldown: number;
  lastHitTick: number; // para o efeito visual de dano
  sighted: boolean; // já foi anunciado ao jogador
  skin: number; // variação de cor
  horde: boolean; // faz parte de um Grande Ataque
}

export interface ThreatState {
  nextSpawnTick: number;
  nextGreatAttackDay: number;
  greatAttackAnnounced: boolean;
  greatAttackDir: number; // ângulo de onde vem a horda
}

export interface MoraleModifier {
  reason: string;
  value: number;
  expiresTick: number;
}

// Memorial: cada morador que morreu, para sempre lembrado.
export interface MemorialEntry {
  name: string;
  kind: UnitKind;
  day: number;
  cause: string; // "devorado por um titã", "levada pela febre"...
  level: number;
  kills: number;
  noble: boolean;
}

// Pontos de interesse fora dos muros, revelados ao explorar.
export type PoiKind = 'ruins' | 'survivors' | 'nest' | 'deposit' | 'lore';

export interface Poi {
  id: number;
  kind: PoiKind;
  tx: number;
  ty: number;
  discovered: boolean; // já foi visto (aparece no mapa e no minimapa)
  done: boolean; // saqueado, resgatado, limpo ou lido
  progress: number; // segundos de busca/leitura/limpeza já feitos
  value: number; // ruínas: tipo do saque; sobreviventes: quantos; história: qual fragmento
}

export interface Stats {
  titansKilled: number;
  deaths: number;
  greatAttacksRepelled: number;
  flawlessHordes: number;
  hordeDeathsAtStart: number; // mortes contadas quando a horda atual chegou (-1 = sem horda)
  gathered: Resources;
  moraleHighHours: number;
  wintersSurvived: number;
  wintersWithoutHunger: number;
}

export interface CityState {
  starving: boolean; // faltou comida na última hora
  cold: boolean; // faltou lenha na última hora de inverno
  hungerThisWinter: boolean;
  taxCarry: number; // frações de ouro acumuladas
}

export interface EventState {
  nextDay: number;
  active: { id: string; data: Record<string, number> } | null;
}

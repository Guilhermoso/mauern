import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, NODE_DEFS, UNIT_DEFS, buildingMessage, type Cost } from '../data/defs';
import type { Sim } from '../core/sim';
import { addLog, newBuilding } from '../state';
import type { Building, BuildingKind, ResourceKind, Unit, UnitKind } from '../entities/types';
import { TILE_INFO } from '../world/terrain';
import { getTile } from '../world/world';
import { farmTaken, findNearestNode, gathererCounts, isExposed } from './queries';
import { isVisible } from './fog';
import { ERA_NAMES } from './era';
import { buildingMaxHp } from './modifiers';
import { commandTrain } from './soldiers';
import { commandHospital } from './hospital';
import { setOrder } from './units';
import { ejectGarrison, removeBuilding, titanRadius } from './damage';

// Comandos do jogador. A interface chama estas funções; elas validam e alteram o estado.
// Retornam uma mensagem de erro (string) quando o comando não pode ser executado.

export function canAfford(sim: Sim, cost: Cost): boolean {
  return (Object.entries(cost) as [ResourceKind, number][]).every(([k, v]) => sim.state.resources[k] >= v);
}

export function pay(sim: Sim, cost: Cost): void {
  for (const [k, v] of Object.entries(cost) as [ResourceKind, number][]) sim.state.resources[k] -= v;
}

export function refund(sim: Sim, cost: Cost, fraction = 1): void {
  for (const [k, v] of Object.entries(cost) as [ResourceKind, number][]) sim.state.resources[k] += Math.floor(v * fraction);
}

function units(sim: Sim, ids: readonly number[]): Unit[] {
  return ids.map((id) => sim.unit(id)).filter((u): u is Unit => !!u);
}

// Distribui várias unidades em tiles livres ao redor do destino, para não ficarem empilhadas.
function formationTiles(sim: Sim, tx: number, ty: number, count: number): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  const seen = new Set<number>();
  const queue: [number, number][] = [[tx, ty]];
  const w = sim.nav.width;
  seen.add(ty * w + tx);
  while (queue.length && out.length < count) {
    const [x, y] = queue.shift()!;
    if (sim.nav.isFree(x, y)) out.push({ tx: x, ty: y });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = ny * w + nx;
      if (!sim.nav.inBounds(nx, ny) || seen.has(k) || Math.abs(nx - tx) > 12 || Math.abs(ny - ty) > 12) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return out;
}

export function commandMove(sim: Sim, ids: readonly number[], tx: number, ty: number): void {
  const list = units(sim, ids);
  const spots = formationTiles(sim, tx, ty, list.length);
  // Unidades mais próximas do destino ficam com os tiles mais próximos.
  const ts = sim.tileSize;
  list.sort((a, b) => (a.x - tx * ts) ** 2 + (a.y - ty * ts) ** 2 - ((b.x - tx * ts) ** 2 + (b.y - ty * ts) ** 2));
  list.forEach((u, i) => {
    const spot = spots[i] ?? { tx, ty };
    setOrder(u, { type: 'move', tx: spot.tx, ty: spot.ty });
  });
}

export function commandGather(sim: Sim, ids: readonly number[], nodeId: number): string | null {
  let node = sim.node(nodeId);
  if (!node) return 'Recurso não encontrado.';
  if (!NODE_DEFS[node.kind].gatherable) return 'Ainda não sabemos aproveitar estes cristais.';
  // Recurso cercado (ex.: árvore no meio da floresta): vai para o vizinho igual mais próximo que dá para alcançar.
  if (!isExposed(sim, node)) {
    node = findNearestNode(sim, node.kind, node.tx, node.ty, BALANCE.units.nodeSearchRadius) ?? node;
  }
  // No máximo 3 aldeões por recurso: os que sobram vão para os iguais mais próximos com vaga.
  const target = node;
  const list = units(sim, ids);
  for (const u of list) {
    if (u.order.type === 'gather') setOrder(u, { type: 'idle' }); // libera a vaga que ocupava
  }
  const ts = sim.tileSize;
  list.sort((a, b) => (a.x - target.tx * ts) ** 2 + (a.y - target.ty * ts) ** 2 - ((b.x - target.tx * ts) ** 2 + (b.y - target.ty * ts) ** 2));
  for (const u of list) {
    if (!UNIT_DEFS[u.kind].canGather) {
      commandMove(sim, [u.id], target.tx, target.ty);
      continue;
    }
    const counts = gathererCounts(sim, u.id);
    const n = (counts.get(target.id) ?? 0) < BALANCE.units.maxGatherersPerNode
      ? target
      : findNearestNode(sim, target.kind, target.tx, target.ty, BALANCE.units.nodeSearchRadius, [], counts) ?? target;
    setOrder(u, { type: 'gather', nodeId: n.id, nodeKind: n.kind, tx: n.tx, ty: n.ty, phase: 'collect', avoid: [] });
  }
  return null;
}

export function commandBuild(sim: Sim, ids: readonly number[], buildingId: number): void {
  const b = sim.building(buildingId);
  if (!b) return;
  for (const u of units(sim, ids)) {
    if (UNIT_DEFS[u.kind].canBuild) setOrder(u, { type: 'build', buildingId });
  }
}

export function commandFarm(sim: Sim, ids: readonly number[], farmId: number): void {
  const farm = sim.building(farmId);
  if (!farm) return;
  const villagers = units(sim, ids).filter((u) => UNIT_DEFS[u.kind].canGather);
  // Um aldeão por fazenda: o primeiro trabalha nela, os outros procuram fazendas livres.
  villagers.forEach((u, i) => {
    if (i === 0 && !farmTaken(sim, farm, u.id)) {
      farm.farmerId = u.id;
      setOrder(u, { type: 'farm', buildingId: farm.id, phase: 'collect' });
    } else {
      setOrder(u, { type: 'farm', buildingId: -1, phase: 'collect' });
    }
  });
}

export function commandDeliver(sim: Sim, ids: readonly number[], buildingId: number): void {
  for (const u of units(sim, ids)) {
    if (u.carry) setOrder(u, { type: 'deliver', buildingId });
  }
}

export function commandAttack(sim: Sim, ids: readonly number[], titanId: number): void {
  for (const u of units(sim, ids)) setOrder(u, { type: 'attack', titanId });
}

export function commandGarrison(sim: Sim, ids: readonly number[], buildingId: number): string | null {
  const b = sim.building(buildingId);
  if (!b || !b.built) return 'Edifício indisponível.';
  const def = BUILDING_DEFS[b.kind];
  if (def.garrison === 0) return 'Este edifício não abriga unidades.';
  for (const u of units(sim, ids)) setOrder(u, { type: 'garrison', buildingId });
  return null;
}

// Libera os abrigados (menos os aterrorizados e o guarda do refúgio), sem retomar o trabalho.
export function ungarrison(sim: Sim, buildingId: number): void {
  const b = sim.building(buildingId);
  if (b) for (const u of ejectGarrison(sim, b, (x) => x.terror <= 0 && x.id !== b.guardId)) u.prevOrder = null;
}

// Titã sob o ponto (em pixels de mundo), se houver.
export function titanAt(sim: Sim, wx: number, wy: number, slack = 4): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const t of sim.state.titans) {
    // Titã escondido pela névoa de guerra não pode ser clicado.
    if (sim.fogVersion > 0 && !isVisible(sim, t.x, t.y)) continue;
    const d = Math.hypot(t.x - wx, t.y - wy);
    if (d <= titanRadius(t.height) + slack && d < bestD) {
      bestD = d;
      best = t.id;
    }
  }
  return best;
}

// Comando do botão direito: decide a ação conforme o que está sob o cursor (pixels de mundo).
export function smartCommand(sim: Sim, ids: readonly number[], wx: number, wy: number): string | null {
  if (ids.length === 0) return null;
  const ts = sim.tileSize;
  const tx = Math.floor(wx / ts);
  const ty = Math.floor(wy / ts);

  const titanId = titanAt(sim, wx, wy);
  if (titanId !== null) {
    commandAttack(sim, ids, titanId);
    return null;
  }

  const node = sim.nodeAt(tx, ty);
  if (node) return commandGather(sim, ids, node.id);

  const b = sim.buildingAt(tx, ty);
  if (b) {
    const def = BUILDING_DEFS[b.kind];
    const list = units(sim, ids);
    const builders = list.filter((u) => UNIT_DEFS[u.kind].canBuild);
    const others = list.filter((u) => !UNIT_DEFS[u.kind].canBuild).map((u) => u.id);
    const bIds = builders.map((u) => u.id);
    // Militares: treinam no campo de treinamento, abrigam-se em torres e no Centro da Vila; senão, só andam até lá.
    if (others.length) {
      if (b.built && def.hospital) {
        const err = commandHospital(sim, others, b.id);
        if (err) return err;
      } else if (b.built && b.kind === 'trainingGround') {
        const err = commandTrain(sim, others, b.id);
        if (err) return err;
      } else if (b.built && def.garrison > 0) commandGarrison(sim, others, b.id);
      else commandMove(sim, others, tx, ty);
    }
    if (!builders.length) return null;
    // Hospital pronto e inteiro: aldeões viram médicos.
    if (b.built && def.hospital && b.hp >= buildingMaxHp(sim.state, b)) return commandHospital(sim, bIds, b.id);
    if (!b.built || b.hp < buildingMaxHp(sim.state, b)) commandBuild(sim, bIds, b.id);
    else if (b.kind === 'farm') commandFarm(sim, bIds, b.id);
    else {
      const carrying = builders.filter((u) => u.carry && def.dropsite.includes(u.carry.kind));
      commandDeliver(sim, carrying.map((u) => u.id), b.id);
      const rest = builders.filter((u) => !carrying.includes(u)).map((u) => u.id);
      if (rest.length) {
        if (def.garrison > 0) commandGarrison(sim, rest, b.id);
        else commandMove(sim, rest, tx, ty);
      }
    }
    return null;
  }
  commandMove(sim, ids, tx, ty);
  return null;
}

// Edifícios que podem ser postos por cima de outro (o antigo é substituído):
// portões sobre paliçada; muro de pedra sobre paliçada; portão de pedra sobre paliçada, portão ou muro.
export function canReplace(kind: BuildingKind, existing: Building): boolean {
  if (existing.ruined) return false; // escombro se reconstrói (clique direito com aldeões)
  if (kind === 'stoneWall') return existing.kind === 'palisade';
  if (kind === 'stoneGate') return existing.kind === 'palisade' || existing.kind === 'gate' || existing.kind === 'stoneWall';
  return BUILDING_DEFS[kind].gate === true && existing.kind === 'palisade';
}

export function eraLocked(sim: Sim, kind: BuildingKind): string | null {
  const era = BUILDING_DEFS[kind].era ?? 0;
  return era > sim.state.era ? `Disponível na ${ERA_NAMES[era]}.` : null;
}

// Põe o novo edifício no lugar do antigo; a obra começa com a vida do que havia ali, para não abrir
// uma brecha enquanto a paliçada vira pedra.
function replaceAt(sim: Sim, kind: BuildingKind, tx: number, ty: number): number {
  const old = sim.buildingAt(tx, ty);
  if (!old || !canReplace(kind, old)) return 0;
  const hp = old.built ? old.hp : 0;
  removeBuilding(sim, old);
  return hp;
}

export function canPlace(sim: Sim, kind: BuildingKind, tx: number, ty: number): string | null {
  const size = BUILDING_DEFS[kind].size;
  for (let y = ty; y < ty + size; y++) {
    for (let x = tx; x < tx + size; x++) {
      if (!sim.nav.inBounds(x, y)) return 'Fora do mapa.';
      if (!TILE_INFO[getTile(sim.state.world, x, y)].buildable) return 'Terreno impróprio para construir.';
      if (sim.nodeAt(x, y)) return 'Há recursos no caminho.';
      const existing = sim.buildingAt(x, y);
      if (existing && !canReplace(kind, existing)) return 'Já existe uma construção aqui.';
    }
  }
  return null;
}

export function placeBuilding(
  sim: Sim,
  kind: BuildingKind,
  tx: number,
  ty: number,
  builderIds: readonly number[],
): { building?: Building; error?: string } {
  const def = BUILDING_DEFS[kind];
  const locked = eraLocked(sim, kind);
  if (locked) return { error: locked };
  if (!canAfford(sim, def.cost)) return { error: 'Recursos insuficientes.' };
  const err = canPlace(sim, kind, tx, ty);
  if (err) return { error: err };
  pay(sim, def.cost);
  const inherited = def.size === 1 ? replaceAt(sim, kind, tx, ty) : 0;
  const b = newBuilding(sim.nextId(), kind, tx, ty, false);
  if (inherited) b.hp = inherited;
  sim.state.buildings.push(b);
  sim.occupyBuilding(b);
  commandBuild(sim, builderIds, b.id);
  return { building: b };
}

// Tiles de uma linha reta (8 direções) entre dois pontos — usada para muralhas.
export function lineTiles(x0: number, y0: number, x1: number, y1: number): { tx: number; ty: number }[] {
  const out: { tx: number; ty: number }[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push({ tx: x, ty: y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

// Constrói uma linha de muralha. Pula tiles ocupados (inclusive muralha já existente)
// e para quando os recursos acabam. Retorna quantos segmentos foram colocados.
export function placeWallLine(
  sim: Sim,
  kind: BuildingKind,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  builderIds: readonly number[],
): number {
  const def = BUILDING_DEFS[kind];
  if (eraLocked(sim, kind)) return 0;
  let placed = 0;
  const tiles = lineTiles(x0, y0, x1, y1);
  // Os construtores começam pela ponta mais próxima deles.
  const list = units(sim, builderIds);
  if (list.length) {
    const ts = sim.tileSize;
    const ux = list[0].x / ts;
    const uy = list[0].y / ts;
    if (Math.hypot(x1 - ux, y1 - uy) < Math.hypot(x0 - ux, y0 - uy)) tiles.reverse();
  }
  for (const { tx, ty } of tiles) {
    if (!canAfford(sim, def.cost)) break;
    if (canPlace(sim, kind, tx, ty)) continue;
    pay(sim, def.cost);
    const inherited = replaceAt(sim, kind, tx, ty);
    const b = newBuilding(sim.nextId(), kind, tx, ty, false);
    if (inherited) b.hp = inherited;
    sim.state.buildings.push(b);
    sim.occupyBuilding(b);
    if (placed === 0) commandBuild(sim, builderIds, b.id);
    placed++;
  }
  return placed;
}

// Treina uma unidade. Unidades militares entram no último lote do mesmo tipo, mesmo que já tenha
// começado (o tempo do lote cresce e o progresso feito é mantido), até o tamanho máximo do lote.
// Com fullBatch, enfileira um lote cheio de uma vez (o que der para pagar).
export function trainUnit(sim: Sim, buildingId: number, kind: UnitKind, fullBatch = false): string | null {
  const b = sim.building(buildingId);
  if (!b || !b.built) return 'Edifício indisponível.';
  if (!BUILDING_DEFS[b.kind].trains.includes(kind)) return 'Este edifício não treina esta unidade.';
  if ((UNIT_DEFS[kind].era ?? 0) > sim.state.era) return `Disponível na ${ERA_NAMES[UNIT_DEFS[kind].era ?? 0]}.`;
  const cost = UNIT_DEFS[kind].cost;
  if (!canAfford(sim, cost)) return 'Recursos insuficientes.';
  const maxBatch = UNIT_DEFS[kind].military ? BALANCE.units.maxBatch : 1;
  const last = b.queue[b.queue.length - 1];
  const canJoin = !fullBatch && last && last.kind === kind && last.count < maxBatch;
  if (!canJoin && b.queue.length >= BALANCE.units.maxTrainQueue) return 'A fila de treino está cheia.';
  const item = canJoin ? last : { kind, count: 0, progress: 0 };
  if (!canJoin) b.queue.push(item);
  const want = fullBatch ? maxBatch - item.count : 1;
  for (let i = 0; i < want && canAfford(sim, cost); i++) {
    pay(sim, cost);
    item.count++;
  }
  return null;
}

// Cancela uma unidade do lote (o lote some quando fica vazio).
export function cancelTrain(sim: Sim, buildingId: number, index: number): void {
  const b = sim.building(buildingId);
  const item = b?.queue[index];
  if (!b || !item) return;
  refund(sim, UNIT_DEFS[item.kind].cost);
  item.count--;
  if (item.count <= 0) b.queue.splice(index, 1);
}

export function setRally(sim: Sim, buildingId: number, tx: number, ty: number): void {
  const b = sim.building(buildingId);
  if (!b || BUILDING_DEFS[b.kind].trains.length === 0) return;
  const node = sim.nodeAt(tx, ty);
  b.rally = node ? { tx, ty, nodeId: node.id } : { tx, ty };
}

// Remove uma unidade ou edifício do jogador. Construções inacabadas devolvem os recursos.
export function deleteEntity(sim: Sim, id: number): void {
  const ui = sim.state.units.findIndex((u) => u.id === id);
  if (ui >= 0) {
    sim.state.units.splice(ui, 1);
    return;
  }
  const b = sim.building(id);
  if (!b) return;
  if (b.kind === 'townCenter' && sim.state.buildings.filter((x) => x.kind === 'townCenter').length === 1) return;
  const def = BUILDING_DEFS[b.kind];
  if (!b.built) refund(sim, def.cost, 1 - b.progress / def.buildTime);
  for (const item of b.queue) refund(sim, UNIT_DEFS[item.kind].cost);
  removeBuilding(sim, b);
  if (!def.wall) addLog(sim.state, buildingMessage(def, 'demolido', 'demolida'));
}

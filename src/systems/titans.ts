import { BALANCE } from '../data/balance';
import { BUILDING_DEFS, UNIT_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { getClock, ticksPerDay } from '../core/time';
import { addLog } from '../state';
import type { Building, Titan } from '../entities/types';
import { findPath, goalKey, type CostFn, type Goal } from '../world/pathfinding';
import { Tile } from '../world/terrain';
import { stepToward } from './movement';
import { damageBuilding, damageUnit, titanRadius } from './damage';
import { titanDamageFactor } from './nobility';
import { nestSpawnPoint } from './expeditions';
import { isGateOpen } from './gates';

const T = BALANCE.titans;
const TPS = BALANCE.time.ticksPerSecond;
const DT = 1 / TPS;
const TICKS_PER_HOUR = ticksPerDay() / 24;

function eraIndex(sim: Sim): number {
  return Math.min(sim.state.era, T.maxHeightByEra.length - 1);
}

export function isDaytime(tick: number): boolean {
  const h = getClock(tick).hour;
  return h >= BALANCE.time.dawnHour && h < BALANCE.time.duskHour;
}

// Anormais (Era II em diante): mais vida, um pouco mais de dano e muito mais rápidos.
export function titanStats(height: number, kind: Titan['kind'] = 'common') {
  const ab = kind === 'abnormal';
  return {
    maxHp: Math.round(T.hpPerMeter * height * (ab ? T.abnormal.hpMult : 1)),
    damage: T.damagePerMeter * height * (ab ? T.abnormal.damageMult : 1),
    speed: (T.speedBase + T.speedPerMeter * height) * (ab ? T.abnormal.speedMult : 1),
    radius: titanRadius(height),
  };
}

// Sorteia se um titã novo é anormal (só a partir da Era II).
function rollKind(sim: Sim): Titan['kind'] {
  return sim.state.era >= 1 && sim.rng.chance(T.abnormal.chance) ? 'abnormal' : 'common';
}

// --- Surgimento e agendamento da ameaça ---

function rollHeight(sim: Sim, day: number, bias = 1): number {
  const cap = T.maxHeightByEra[eraIndex(sim)];
  const max = Math.min(cap, T.minHeight + T.heightGrowthPerDay * day);
  const h = T.minHeight + Math.pow(sim.rng.next(), bias) * (max - T.minHeight);
  return Math.round(h * 10) / 10;
}

// Ponto na borda do mapa, na direção dada, onde um titã pode andar.
function edgePoint(sim: Sim, angle: number): { tx: number; ty: number } | null {
  const w = sim.state.world.width;
  const h = sim.state.world.height;
  const cx = w / 2;
  const cy = h / 2;
  for (let r = Math.min(cx, cy) - 3; r >= T.spawnMinDistance; r -= 3) {
    const tx = Math.round(cx + Math.cos(angle) * r);
    const ty = Math.round(cy + Math.sin(angle) * r);
    for (let d = 0; d < 6; d++) {
      for (const [ox, oy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) {
        if (sim.nav.isTerrainWalkable(tx + ox, ty + oy) && sim.isLandConnected(tx + ox, ty + oy)) return { tx: tx + ox, ty: ty + oy };
      }
    }
  }
  return null;
}

// Para testes e para o painel de debug: um titã a uma certa distância (em tiles) do centro.
export function spawnTitanNear(sim: Sim, height: number, distance: number): Titan | null {
  const c = sim.state.world.width / 2;
  for (let attempt = 0; attempt < 30; attempt++) {
    const a = sim.rng.range(0, Math.PI * 2);
    const tx = Math.round(c + Math.cos(a) * distance);
    const ty = Math.round(c + Math.sin(a) * distance);
    if (sim.nav.isTerrainWalkable(tx, ty) && sim.isLandConnected(tx, ty) && !sim.buildingAt(tx, ty)) return spawnTitan(sim, height, undefined, { tx, ty });
  }
  return null;
}

export function spawnTitan(sim: Sim, height: number, angle?: number, at?: { tx: number; ty: number }, kind: Titan['kind'] = 'common'): Titan | null {
  const ts = sim.tileSize;
  // Nunca numa ilha isolada (ficaria preso lá, e os soldados também, tentando alcançá-lo).
  let p: { tx: number; ty: number } | null = at && sim.isLandConnected(at.tx, at.ty) ? at : null;
  for (let attempt = 0; attempt < 12 && !p; attempt++) p = edgePoint(sim, angle ?? sim.rng.range(0, Math.PI * 2));
  if (!p) return null;
  const st = titanStats(height, kind);
  const t: Titan = {
    id: sim.nextId(),
    kind,
    height,
    x: (p.tx + 0.5) * ts,
    y: (p.ty + 0.5) * ts,
    hp: st.maxHp,
    maxHp: st.maxHp,
    facing: 0,
    targetKind: 'none',
    targetId: 0,
    path: [],
    pathKey: '',
    repathTick: 0,
    retargetTick: 0,
    attackCooldown: 0,
    lastHitTick: -1000,
    sighted: false,
    skin: sim.rng.next(),
    horde: false,
    leash: null,
  };
  sim.state.titans.push(t);
  return t;
}

function directionName(angle: number): string {
  const names = ['leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste', 'norte', 'nordeste'];
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return names[Math.round(a / (Math.PI / 4)) % 8];
}

export function updateThreat(sim: Sim): void {
  const state = sim.state;
  const th = state.threat;
  const clock = getClock(state.tick);

  // Titãs avulsos: só de dia; o intervalo diminui com os dias até o piso da era.
  if (state.tick >= th.nextSpawnTick) {
    if (isDaytime(state.tick) && state.titans.length < T.maxAlive) {
      // Às vezes o titã sai de um ninho ativo, em vez da borda do mapa.
      spawnTitan(sim, rollHeight(sim, clock.day), undefined, nestSpawnPoint(sim) ?? undefined, rollKind(sim));
      const hours = Math.max(T.minIntervalHours, T.startIntervalHours - T.intervalDecayPerDay * (clock.day - T.firstSpawnDay));
      th.nextSpawnTick = state.tick + Math.round(hours * sim.rng.range(0.7, 1.3) * TICKS_PER_HOUR);
    } else {
      th.nextSpawnTick = state.tick + Math.round(sim.rng.range(1, 3) * TICKS_PER_HOUR);
    }
  }

  // Grande Ataque: anunciado na véspera, chega no meio da manhã.
  if (clock.day > th.nextGreatAttackDay) {
    th.nextGreatAttackDay += T.greatAttackEveryDays * Math.ceil((clock.day - th.nextGreatAttackDay) / T.greatAttackEveryDays);
    th.greatAttackAnnounced = false;
  }
  if (!th.greatAttackAnnounced && clock.day === th.nextGreatAttackDay - 1 && clock.hour >= 6) {
    th.greatAttackAnnounced = true;
    th.greatAttackDir = sim.rng.range(0, Math.PI * 2);
    const text = `Vigias avistam uma horda de titãs vindo do ${directionName(th.greatAttackDir)}. Grande Ataque amanhã!`;
    addLog(state, text);
    const ts = sim.tileSize;
    const c = state.world.width / 2;
    sim.alerts.push({ kind: 'greatAttack', text, x: (c + Math.cos(th.greatAttackDir) * 40) * ts, y: (c + Math.sin(th.greatAttackDir) * 40) * ts });
  }
  if (clock.day === th.nextGreatAttackDay && clock.hour >= T.greatAttackHour) {
    if (!th.greatAttackAnnounced) th.greatAttackDir = sim.rng.range(0, Math.PI * 2);
    const week = Math.floor(clock.day / T.greatAttackEveryDays);
    const n = Math.min(T.greatAttackMaxByEra[eraIndex(sim)], T.greatAttackBase + T.greatAttackPerWeek * (week - 1));
    for (let i = 0; i < n; i++) {
      const t = spawnTitan(sim, rollHeight(sim, clock.day + 3, 0.7), th.greatAttackDir + sim.rng.range(-0.35, 0.35), undefined, rollKind(sim));
      if (t) t.horde = true;
    }
    state.stats.hordeDeathsAtStart = state.stats.deaths;
    addLog(state, `A horda chegou: ${n} titãs avançam do ${directionName(th.greatAttackDir)}!`);
    th.nextGreatAttackDay += T.greatAttackEveryDays;
    th.greatAttackAnnounced = false;
  }
}

// --- Comportamento dos titãs ---

// Titãs grandes (4 m ou mais) atravessam a água rasa.
export function canWade(height: number): boolean {
  return height >= T.wadeMinHeight;
}

function isShallow(sim: Sim, x: number, y: number): boolean {
  const w = sim.state.world;
  return x >= 0 && y >= 0 && x < w.width && y < w.height && w.tiles[y * w.width + x] === Tile.Water;
}

// Terreno por onde o titã anda (o dos humanos, mais a água rasa para os grandes).
function titanWalkable(sim: Sim, x: number, y: number, wade: boolean): boolean {
  return sim.nav.isTerrainWalkable(x, y) || (wade && isShallow(sim, x, y));
}

// Custo de caminho para titãs: atravessam florestas e água rasa (devagar) e derrubam estruturas.
// Estruturas mais fortes custam mais, então eles procuram o ponto mais fraco da muralha.
function titanCost(sim: Sim, wade: boolean): CostFn {
  return (x, y) => {
    if (!sim.nav.isTerrainWalkable(x, y)) return wade && isShallow(sim, x, y) ? T.shallowCost : Infinity;
    const id = sim.buildingIdAt(x, y);
    if (id) {
      const b = sim.building(id);
      // Portão aberto e escombros: passagem livre.
      if (b && !BUILDING_DEFS[b.kind].walkable && !b.ruined && !isGateOpen(sim, b)) return T.wallCostBase + b.hp * T.wallCostPerHp;
    }
    if (sim.nodeAt(x, y)) return T.forestCost;
    return 1;
  };
}

function buildingRect(sim: Sim, b: Building) {
  const ts = sim.tileSize;
  const s = BUILDING_DEFS[b.kind].size;
  return { x0: b.tx * ts, y0: b.ty * ts, x1: (b.tx + s) * ts, y1: (b.ty + s) * ts };
}

function distToBuilding(sim: Sim, x: number, y: number, b: Building): number {
  const r = buildingRect(sim, b);
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}

function chooseTarget(sim: Sim, t: Titan): void {
  const sight = T.sightRadius * sim.tileSize;
  // Anormal: às vezes ignora os humanos e corre atrás de um edifício qualquer, até longe.
  if (t.kind === 'abnormal' && sim.rng.chance(T.abnormal.buildingFixation)) {
    const options = sim.state.buildings.filter((b) => {
      const def = BUILDING_DEFS[b.kind];
      return !def.wall && !def.gate && !def.walkable && distToBuilding(sim, t.x, t.y, b) < sight * 3;
    });
    if (options.length) {
      const b = options[sim.rng.int(0, options.length - 1)];
      t.targetKind = 'building';
      t.targetId = b.id;
      return;
    }
  }
  let best = sight * sight;
  t.targetKind = 'none';
  t.targetId = 0;
  for (const u of sim.state.units) {
    if (u.garrison) continue;
    const d = (u.x - t.x) ** 2 + (u.y - t.y) ** 2;
    if (d < best) {
      best = d;
      t.targetKind = 'unit';
      t.targetId = u.id;
    }
  }
  if (t.targetKind === 'unit') return;
  let bestB = sight;
  for (const b of sim.state.buildings) {
    const def = BUILDING_DEFS[b.kind];
    if (def.wall || def.gate || def.walkable) continue;
    const d = distToBuilding(sim, t.x, t.y, b);
    if (d < bestB) {
      bestB = d;
      t.targetKind = 'building';
      t.targetId = b.id;
    }
  }
  if (t.targetKind === 'building') return;
  // Nada à vista: marcha em direção ao Centro da Vila mais próximo (o cheiro dos humanos).
  let bestTc = Infinity;
  for (const b of sim.state.buildings) {
    if (b.kind !== 'townCenter') continue;
    const d = distToBuilding(sim, t.x, t.y, b);
    if (d < bestTc) {
      bestTc = d;
      t.targetKind = 'march';
      t.targetId = b.id;
    }
  }
}

export function updateTitans(sim: Sim): void {
  const tick = sim.state.tick;
  const day = isDaytime(tick);
  const costs = { wade: titanCost(sim, true), dry: titanCost(sim, false) };
  const ts = sim.tileSize;

  for (const t of [...sim.state.titans]) {
    const st = titanStats(t.height, t.kind);
    // Intimidado por uma lenda: golpeia com menos força.
    const dmg = st.damage * titanDamageFactor(sim, t.id);
    t.hp = Math.min(t.maxHp, t.hp + T.regenPerSecond * DT);
    if (t.attackCooldown > 0) t.attackCooldown -= DT;
    const wade = canWade(t.height);
    const cost = wade ? costs.wade : costs.dry;
    // Dentro da água rasa, anda mais devagar até sair.
    const inWater = isShallow(sim, Math.floor(t.x / sim.tileSize), Math.floor(t.y / sim.tileSize));
    const speed = st.speed * (day ? 1 : T.nightSpeedFactor) * (inWater ? T.shallowSpeedFactor : 1);

    if (tick >= t.retargetTick || targetGone(sim, t)) {
      chooseTarget(sim, t);
      // Anormais mudam de ideia a toda hora.
      const secs = t.kind === 'abnormal' ? sim.rng.range(T.abnormal.retargetMin, T.abnormal.retargetMax) : T.retargetSeconds;
      t.retargetTick = tick + Math.round(secs * TPS) + (t.id % 7);
    }

    alertIfSighted(sim, t);

    // 1. Alvo ao alcance: ataca.
    let goal: Goal | null = null;
    let targetX = t.x;
    let targetY = t.y;
    if (t.targetKind === 'unit') {
      const u = sim.unit(t.targetId)!;
      const reach = st.radius + UNIT_DEFS[u.kind].radius + BALANCE.combat.titanReach;
      const d = Math.hypot(u.x - t.x, u.y - t.y);
      t.facing = Math.atan2(u.y - t.y, u.x - t.x);
      if (d <= reach) {
        if (t.attackCooldown <= 0) {
          t.attackCooldown = T.attackCooldown;
          damageUnit(sim, u, dmg, true);
        }
        continue;
      }
      targetX = u.x;
      targetY = u.y;
      const utx = Math.floor(u.x / ts);
      const uty = Math.floor(u.y / ts);
      goal = { x0: utx, y0: uty, x1: utx, y1: uty, adjacent: true };
    } else if (t.targetKind === 'building' || t.targetKind === 'march') {
      const b = sim.building(t.targetId)!;
      if (distToBuilding(sim, t.x, t.y, b) <= st.radius * 0.5 + 14) {
        attackBuilding(sim, t, b, dmg * T.buildingDamageFactor);
        continue;
      }
      const s = BUILDING_DEFS[b.kind].size;
      goal = { x0: b.tx, y0: b.ty, x1: b.tx + s - 1, y1: b.ty + s - 1, adjacent: true };
      targetX = (b.tx + s / 2) * ts;
      targetY = (b.ty + s / 2) * ts;
    }
    // Guardião de ninho: não persegue nada para longe do ninho; sem alvo por perto, volta e espera lá.
    if (t.leash) {
      const hx = (t.leash.tx + 0.5) * ts;
      const hy = (t.leash.ty + 0.5) * ts;
      const tooFar = Math.hypot(targetX - hx, targetY - hy) > t.leash.r * ts;
      if (!goal || t.targetKind === 'march' || tooFar) {
        if (Math.hypot(t.x - hx, t.y - hy) < 2 * ts) continue;
        goal = { x0: t.leash.tx - 1, y0: t.leash.ty - 1, x1: t.leash.tx + 1, y1: t.leash.ty + 1, adjacent: false };
        targetX = hx;
        targetY = hy;
        if (t.targetKind !== 'unit') t.targetKind = 'none';
      }
    }
    if (!goal) continue;

    // 2. Perto de um humano e com caminho livre: vai direto.
    if (t.targetKind === 'unit' && Math.hypot(targetX - t.x, targetY - t.y) < 2.5 * ts) {
      const nx = t.x + Math.cos(t.facing) * speed * DT * 2;
      const ny = t.y + Math.sin(t.facing) * speed * DT * 2;
      const ntx = Math.floor(nx / ts);
      const nty = Math.floor(ny / ts);
      if (titanWalkable(sim, ntx, nty, wade)) {
        const blocker = structureAt(sim, ntx, nty);
        if (blocker) attackOrApproach(sim, t, blocker, dmg * T.buildingDamageFactor, speed);
        else stepToward(t, targetX, targetY, speed);
        continue;
      }
    }

    // 3. Segue o caminho; se uma estrutura estiver no caminho, derruba.
    const key = goalKey(goal);
    // Recalcula no máximo a cada repathSeconds — mesmo sem caminho (alvo inalcançável), senão a busca
    // inteira se repetiria a cada passo e o jogo engasgaria.
    if ((key !== t.pathKey || t.path.length === 0) && tick >= t.repathTick) {
      const r = findPath(sim.nav, Math.floor(t.x / ts), Math.floor(t.y / ts), goal, 25000, cost);
      t.path = r.tiles;
      t.pathKey = key;
      t.repathTick = tick + Math.round(T.repathSeconds * TPS);
    }
    if (t.path.length === 0) {
      // Sem caminho: anda direto, mas só por onde consegue (não atravessa água funda nem rocha).
      const d = Math.hypot(targetX - t.x, targetY - t.y) || 1;
      const nx = t.x + ((targetX - t.x) / d) * Math.max(speed * DT, ts * 0.5);
      const ny = t.y + ((targetY - t.y) / d) * Math.max(speed * DT, ts * 0.5);
      if (titanWalkable(sim, Math.floor(nx / ts), Math.floor(ny / ts), wade)) stepToward(t, targetX, targetY, speed);
      continue;
    }
    const w = sim.nav.width;
    const next = t.path[0];
    const nx = next % w;
    const ny = (next - nx) / w;
    const blocker = structureAt(sim, nx, ny);
    if (blocker) {
      attackOrApproach(sim, t, blocker, dmg * T.buildingDamageFactor, speed);
      continue;
    }
    t.facing = Math.atan2((ny + 0.5) * ts - t.y, (nx + 0.5) * ts - t.x);
    if (stepToward(t, (nx + 0.5) * ts, (ny + 0.5) * ts, speed)) t.path.shift();
  }
}

function targetGone(sim: Sim, t: Titan): boolean {
  if (t.targetKind === 'unit') {
    const u = sim.unit(t.targetId);
    return !u || u.garrison !== 0;
  }
  if (t.targetKind === 'building' || t.targetKind === 'march') return !sim.building(t.targetId);
  return false;
}

function structureAt(sim: Sim, tx: number, ty: number): Building | undefined {
  const b = sim.buildingAt(tx, ty);
  if (b && isGateOpen(sim, b)) {
    gateBreach(sim, b);
    return undefined;
  }
  return b && !BUILDING_DEFS[b.kind].walkable && !b.ruined ? b : undefined;
}

// Um titã passando por um portão aberto: aviso urgente.
function gateBreach(sim: Sim, b: Building): void {
  const ts = sim.tileSize;
  const text = 'Um titã está entrando pelo portão aberto!';
  if (!sim.alerts.some((a) => a.text === text)) sim.alerts.push({ kind: 'underAttack', text, x: (b.tx + 0.5) * ts, y: (b.ty + 0.5) * ts });
}

function attackOrApproach(sim: Sim, t: Titan, b: Building, damage: number, speed: number): void {
  const st = titanStats(t.height, t.kind);
  if (distToBuilding(sim, t.x, t.y, b) <= st.radius * 0.5 + 14) {
    attackBuilding(sim, t, b, damage);
  } else {
    const r = buildingRect(sim, b);
    stepToward(t, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, speed);
  }
}

function attackBuilding(sim: Sim, t: Titan, b: Building, damage: number): void {
  const r = buildingRect(sim, b);
  t.facing = Math.atan2((r.y0 + r.y1) / 2 - t.y, (r.x0 + r.x1) / 2 - t.x);
  if (t.attackCooldown > 0) return;
  t.attackCooldown = T.attackCooldown;
  sim.alerts.push({
    kind: 'underAttack',
    text: BUILDING_DEFS[b.kind].wall || BUILDING_DEFS[b.kind].gate ? 'A muralha está sob ataque!' : `${BUILDING_DEFS[b.kind].name} sob ataque!`,
    x: (r.x0 + r.x1) / 2,
    y: (r.y0 + r.y1) / 2,
  });
  damageBuilding(sim, b, damage);
  t.path = [];
  t.pathKey = '';
}

function alertIfSighted(sim: Sim, t: Titan): void {
  if (t.sighted) return;
  const radius = T.sightAlertRadius * sim.tileSize;
  const ts = sim.tileSize;
  for (const b of sim.state.buildings) {
    const s = BUILDING_DEFS[b.kind].size;
    const d = Math.hypot((b.tx + s / 2) * ts - t.x, (b.ty + s / 2) * ts - t.y);
    if (d < radius) {
      t.sighted = true;
      const c = sim.state.world.width / 2;
      const dir = directionName(Math.atan2(t.y / ts - c, t.x / ts - c));
      const text = `${t.kind === 'abnormal' ? 'Titã ANORMAL' : 'Titã'} de ${t.height.toFixed(1).replace('.', ',')} m avistado ao ${dir}!`;
      addLog(sim.state, text);
      sim.alerts.push({ kind: 'sighted', text, x: t.x, y: t.y });
      return;
    }
  }
}

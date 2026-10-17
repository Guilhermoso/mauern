import { BALANCE } from '../data/balance';
import { BUILDING_DEFS } from '../data/defs';
import type { Sim } from '../core/sim';
import { onPoiDiscovered } from './expeditions';

// Névoa de guerra: o que está à vista agora (derivado, em Sim.visible) e o que já foi visto alguma
// vez (salvo em GameState.explored). Recalculada a cada fog.updateTicks passos.

const F = BALANCE.fog;
const discCache = new Map<number, number[]>();

// Deslocamentos (dx, dy) de um disco de raio r em tiles.
function disc(r: number): number[] {
  let d = discCache.get(r);
  if (!d) {
    d = [];
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) d.push(x, y);
    discCache.set(r, d);
  }
  return d;
}

export function updateFog(sim: Sim, force = false): void {
  const s = sim.state;
  if (!force && s.tick % F.updateTicks !== 0) return;
  const w = s.world.width;
  const h = s.world.height;
  const vis = sim.visible;
  const explored = s.explored;
  vis.fill(0);
  let newlyExplored = false;
  const mark = (cx: number, cy: number, r: number) => {
    const d = disc(r);
    for (let i = 0; i < d.length; i += 2) {
      const x = cx + d[i];
      const y = cy + d[i + 1];
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = y * w + x;
      vis[k] = 1;
      if (!explored[k]) {
        explored[k] = 1;
        newlyExplored = true;
      }
    }
  };
  const ts = sim.tileSize;
  for (const u of s.units) {
    if (u.garrison) continue;
    mark(Math.floor(u.x / ts), Math.floor(u.y / ts), F.sight[u.kind] ?? 6);
  }
  for (const b of s.buildings) {
    const size = BUILDING_DEFS[b.kind].size;
    const r = b.built ? (F.buildingSightByKind[b.kind] ?? F.buildingSight) : 3;
    mark(b.tx + Math.floor(size / 2), b.ty + Math.floor(size / 2), r);
  }
  sim.fogVersion++;
  if (newlyExplored) discoverPois(sim);
}

// Pontos de interesse que entraram na visão pela primeira vez.
function discoverPois(sim: Sim): void {
  const s = sim.state;
  const w = s.world.width;
  for (const p of s.pois) {
    if (p.discovered || !s.explored[p.ty * w + p.tx]) continue;
    p.discovered = true;
    onPoiDiscovered(sim, p);
  }
}

export function isVisible(sim: Sim, x: number, y: number): boolean {
  const ts = sim.tileSize;
  const tx = Math.floor(x / ts);
  const ty = Math.floor(y / ts);
  const w = sim.state.world.width;
  if (tx < 0 || ty < 0 || tx >= w || ty >= sim.state.world.height) return false;
  return sim.visible[ty * w + tx] === 1;
}

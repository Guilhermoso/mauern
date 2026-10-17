import { BALANCE } from '../data/balance';
import { Rng, hashString } from '../core/rng';
import { landConnectedFrom } from './connectivity';
import type { World } from './world';
import type { Poi, PoiKind } from '../entities/types';

// Espalha os pontos de interesse pelo território externo (longe do centro), de forma determinística
// pela seed. As jazidas valiosas também acrescentam veios de ferro ricos ao mapa.
// `nextNodeId` dá IDs para esses recursos novos; `blocked` evita lugares já ocupados (saves antigos).
export function generatePois(world: World, seed: string, nextNodeId: () => number, blocked: (x: number, y: number) => boolean = () => false): Poi[] {
  const P = BALANCE.pois;
  const rng = new Rng(hashString(seed) ^ 0x50a1c3d7);
  const cx = world.width / 2;
  const cy = world.height / 2;
  const nodeAt = new Set(world.resourceNodes.map((n) => n.ty * world.width + n.tx));
  // Só em terra ligada à vila (nada de ilhas inalcançáveis).
  const land = landConnectedFrom(world, Math.floor(cx), Math.floor(cy));
  const free = (x: number, y: number) =>
    x >= 2 && y >= 2 && x < world.width - 2 && y < world.height - 2 && land[y * world.width + x] === 1 && !nodeAt.has(y * world.width + x);

  const pois: Poi[] = [];
  const kinds: PoiKind[] = [];
  for (const [kind, n] of Object.entries(P.count)) for (let i = 0; i < n; i++) kinds.push(kind as PoiKind);
  let loreIndex = 0;
  for (const kind of kinds) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(P.minDistance, Math.min(cx, cy) - 6);
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (!free(x, y) || blocked(x, y)) continue;
      // Um pouco de espaço livre em volta, e longe dos outros pontos.
      let roomy = true;
      for (let dy = -1; dy <= 1 && roomy; dy++) for (let dx = -1; dx <= 1; dx++) if (!free(x + dx, y + dy)) roomy = false;
      if (!roomy || pois.some((p) => Math.hypot(p.tx - x, p.ty - y) < P.spacing)) continue;
      const value =
        kind === 'ruins' ? rng.int(0, P.ruinsLoot.length - 1) : kind === 'survivors' ? rng.int(P.survivorsMin, P.survivorsMax) : kind === 'lore' ? loreIndex++ : 0;
      pois.push({ id: pois.length + 1, kind, tx: x, ty: y, discovered: false, done: false, progress: 0, value });
      if (kind === 'deposit') {
        // Veio de ferro rico em volta do ponto.
        let placed = 0;
        for (let i = 0; i < 40 && placed < P.depositNodes; i++) {
          const nx = x + rng.int(-2, 2);
          const ny = y + rng.int(-2, 2);
          if ((nx === x && ny === y) || !free(nx, ny)) continue;
          world.resourceNodes.push({
            id: nextNodeId(), kind: 'iron', tx: nx, ty: ny,
            amount: BALANCE.resources.ironAmount * P.depositAmountMult, variant: Math.round(rng.next() * 1000) / 1000,
          });
          nodeAt.add(ny * world.width + nx);
          placed++;
        }
      }
      break;
    }
  }
  return pois;
}

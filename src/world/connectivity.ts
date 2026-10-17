import { TILE_INFO } from './terrain';
import type { World } from './world';

// Terra firme ligada a um ponto (preenchimento em 4 direções pelos tiles transitáveis do terreno,
// ignorando árvores e edifícios). Serve para não pôr titãs nem pontos de interesse em ilhas isoladas.
export function landConnectedFrom(world: World, sx: number, sy: number): Uint8Array {
  const w = world.width;
  const h = world.height;
  const out = new Uint8Array(w * h);
  const walk = (i: number) => TILE_INFO[world.tiles[i]].walkable;
  const start = sy * w + sx;
  if (!walk(start)) return out;
  const stack = [start];
  out[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && !out[i - 1] && walk(i - 1)) (out[i - 1] = 1), stack.push(i - 1);
    if (x < w - 1 && !out[i + 1] && walk(i + 1)) (out[i + 1] = 1), stack.push(i + 1);
    if (y > 0 && !out[i - w] && walk(i - w)) (out[i - w] = 1), stack.push(i - w);
    if (y < h - 1 && !out[i + w] && walk(i + w)) (out[i + w] = 1), stack.push(i + w);
  }
  return out;
}

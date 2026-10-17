import { BALANCE } from '../data/balance';
import { fbm } from '../core/noise';
import { Rng, hashString } from '../core/rng';
import { Tile } from './terrain';
import { getTile, inBounds, setTile, type World } from './world';
import type { ResourceNodeKind } from '../entities/types';

// Gera o mapa a partir de uma seed. O mesmo seed sempre gera o mesmo mundo.
// O Centro da Vila fica no centro do mapa, numa clareira com os recursos iniciais por perto.

export function generateWorld(seed: string): World {
  const { width, height, startClearRadius } = BALANCE.world;
  const base = hashString(seed);
  const rng = new Rng(base ^ 0x9e3779b9);
  const world: World = { width, height, tiles: new Uint8Array(width * height), resourceNodes: [] };
  const cx = width / 2;
  const cy = height / 2;

  // 1. Terreno base por elevação e umidade.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      // Perto do centro a elevação tende ao meio, evitando água e rocha na clareira inicial.
      const centerPull = Math.max(0, 1 - dist / 40);
      let elev = fbm(x / 48, y / 48, base, 5);
      elev = elev * (1 - centerPull) + 0.5 * centerPull;
      const moist = fbm(x / 26, y / 26, base + 7777, 4);

      let tile: Tile;
      if (elev < 0.3) tile = Tile.DeepWater;
      else if (elev < 0.35) tile = Tile.Water;
      else if (elev < 0.37) tile = Tile.Sand;
      else if (elev > 0.72) tile = Tile.Rock;
      else if (moist > 0.56) tile = Tile.Forest;
      else if (moist < 0.32) tile = Tile.Dirt;
      else tile = Tile.Grass;
      setTile(world, x, y, tile);
    }
  }

  // 2. Clareira inicial.
  forDisc(cx, cy, startClearRadius, (x, y) => setTile(world, x, y, Tile.Grass));

  // 3. Recursos garantidos perto do início.
  const occupied = new Set<number>();
  const key = (x: number, y: number) => y * width + x;
  // Reserva o Centro da Vila e uma margem ao redor.
  forDisc(cx, cy, 4, (x, y) => occupied.add(key(x, y)));

  let nextId = 1;
  const addNode = (kind: ResourceNodeKind, tx: number, ty: number, amount: number) => {
    if (!inBounds(world, tx, ty) || occupied.has(key(tx, ty))) return false;
    occupied.add(key(tx, ty));
    world.resourceNodes.push({ id: nextId++, kind, tx, ty, amount, variant: Math.round(rng.next() * 1000) / 1000 });
    return true;
  };

  const R = BALANCE.resources;
  const dirs = shuffledDirections(rng);
  const around = (dirIndex: number, dist: number) => {
    const a = dirs[dirIndex];
    return { x: Math.round(cx + Math.cos(a) * dist), y: Math.round(cy + Math.sin(a) * dist) };
  };

  // Bosque perto da vila.
  const grove = around(0, rng.range(11, 14));
  forDisc(grove.x, grove.y, 4, (x, y) => {
    if (rng.chance(0.8)) setTile(world, x, y, Tile.Forest);
  });
  // Arbustos de frutas.
  const berries = around(1, rng.range(6, 8));
  forDisc(berries.x, berries.y, 2, (x, y) => {
    if (rng.chance(0.75)) addNode('berries', x, y, R.berryFood);
  });
  // Jazida de pedra pequena.
  const stone = around(2, rng.range(10, 13));
  forDisc(stone.x, stone.y, 1.5, (x, y) => addNode('stone', x, y, R.stoneAmount));

  // 4. Árvores em todos os tiles de floresta (exceto na área reservada).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (getTile(world, x, y) === Tile.Forest) addNode('tree', x, y, R.treeWood);
    }
  }

  // 5. Jazidas espalhadas: pedra junto às rochas, ferro e cristais mais longe do centro.
  scatterDeposits(world, rng, 'stone', 26, 18, 2, R.stoneAmount, addNode);
  scatterDeposits(world, rng, 'iron', 18, 40, 2, R.ironAmount, addNode);
  scatterDeposits(world, rng, 'crystal', 10, 75, 1.5, R.crystalAmount, addNode);

  return world;
}

function forDisc(cx: number, cy: number, r: number, fn: (x: number, y: number) => void): void {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) fn(x, y);
    }
  }
}

function shuffledDirections(rng: Rng): number[] {
  const base = rng.range(0, Math.PI * 2);
  const dirs = [0, 1, 2, 3, 4, 5].map((i) => base + (i * Math.PI * 2) / 6);
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }
  return dirs;
}

function scatterDeposits(
  world: World,
  rng: Rng,
  kind: ResourceNodeKind,
  count: number,
  minDist: number,
  radius: number,
  amount: number,
  addNode: (kind: ResourceNodeKind, tx: number, ty: number, amount: number) => boolean,
): void {
  const cx = world.width / 2;
  const cy = world.height / 2;
  let placed = 0;
  for (let attempt = 0; attempt < count * 40 && placed < count; attempt++) {
    const x = rng.int(4, world.width - 5);
    const y = rng.int(4, world.height - 5);
    if (Math.hypot(x - cx, y - cy) < minDist) continue;
    const t = getTile(world, x, y);
    if (t !== Tile.Grass && t !== Tile.Dirt) continue;
    forDisc(x, y, radius, (px, py) => {
      const pt = getTile(world, px, py);
      if (pt === Tile.Grass || pt === Tile.Dirt) addNode(kind, px, py, amount);
    });
    placed++;
  }
}

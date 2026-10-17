import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { BALANCE } from '../src/data/balance';
import { Tile } from '../src/world/terrain';
import { addTitan, CENTER, flatGame, runSeconds, setNoon } from './helpers';
import type { GameState } from '../src/state';

const TS = BALANCE.world.tileSize;

// Um rio vertical de 3 tiles separando o titã (a leste) do Centro da Vila.
function riverGame(tile: number): GameState {
  const s = flatGame();
  setNoon(s);
  const w = s.world.width;
  for (let y = 0; y < s.world.height; y++) for (let x = CENTER + 10; x <= CENTER + 12; x++) s.world.tiles[y * w + x] = tile;
  return s;
}

describe('rios rasos e fundos', () => {
  it('titã de 4 m ou mais atravessa a água rasa', () => {
    const s = riverGame(Tile.Water);
    const t = addTitan(s, CENTER + 18, CENTER, 5);
    const sim = new Sim(s);
    runSeconds(sim, 60);
    expect(t.x / TS).toBeLessThan(CENTER + 10);
  });

  it('titã menor que 4 m não atravessa a água rasa', () => {
    const s = riverGame(Tile.Water);
    const t = addTitan(s, CENTER + 18, CENTER, 3);
    const sim = new Sim(s);
    runSeconds(sim, 60);
    expect(t.x / TS).toBeGreaterThan(CENTER + 12);
  });

  it('nenhum titã atravessa a água funda', () => {
    const s = riverGame(Tile.DeepWater);
    const t = addTitan(s, CENTER + 18, CENTER, 8);
    const sim = new Sim(s);
    runSeconds(sim, 60);
    expect(t.x / TS).toBeGreaterThan(CENTER + 12);
  });

  it('dentro da água rasa o titã anda mais devagar', () => {
    const speedIn = (tile: number) => {
      const s = flatGame();
      setNoon(s);
      const w = s.world.width;
      // Faixa de água de cima a baixo do mapa: o titã é obrigado a atravessar.
      if (tile !== Tile.Grass) for (let y = 0; y < s.world.height; y++) for (let x = CENTER + 15; x <= CENTER + 25; x++) s.world.tiles[y * w + x] = tile;
      const t = addTitan(s, CENTER + 24, CENTER, 6);
      const sim = new Sim(s);
      const x0 = t.x;
      runSeconds(sim, 2);
      return x0 - t.x;
    };
    expect(speedIn(Tile.Water)).toBeCloseTo(speedIn(Tile.Grass) * BALANCE.titans.shallowSpeedFactor, 0);
  });
});

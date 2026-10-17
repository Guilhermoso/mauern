import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { daylight, getClock, ticksPerDay } from '../src/core/time';
import { FixedLoop } from '../src/core/loop';
import { BALANCE } from '../src/data/balance';

describe('Rng', () => {
  it('é determinístico para o mesmo estado', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('pode continuar a partir do estado salvo', () => {
    const a = new Rng(7);
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });
});

describe('relógio', () => {
  it('começa no dia 1 na hora inicial', () => {
    const c = getClock(0);
    expect(c.day).toBe(1);
    expect(c.hour).toBe(BALANCE.time.startHour);
    expect(c.season).toBe('Primavera');
    expect(c.year).toBe(1);
  });

  it('avança dias, estações e anos', () => {
    const perDay = ticksPerDay();
    expect(getClock(perDay).day).toBe(2);
    const d = BALANCE.time.daysPerSeason;
    expect(getClock(perDay * d).season).toBe('Verão');
    expect(getClock(perDay * d * 4).year).toBe(2);
  });

  it('tem dia claro ao meio-dia e escuro à meia-noite', () => {
    expect(daylight(0.5)).toBe(1);
    expect(daylight(0)).toBe(0);
  });
});

describe('FixedLoop', () => {
  it('roda ticks proporcionais ao tempo e à velocidade', () => {
    let n = 0;
    const loop = new FixedLoop(() => n++);
    const tickMs = 1000 / BALANCE.time.ticksPerSecond;
    for (let i = 0; i < 10; i++) loop.advance(tickMs * 2, 3);
    expect(n).toBe(60);
  });

  it('não avança pausado', () => {
    let n = 0;
    const loop = new FixedLoop(() => n++);
    loop.advance(1000, 0);
    expect(n).toBe(0);
  });
});

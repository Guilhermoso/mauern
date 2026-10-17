import { BALANCE } from '../data/balance';

export const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'] as const;
export type Season = (typeof SEASONS)[number];

const TICKS_PER_DAY = BALANCE.time.ticksPerSecond * BALANCE.time.secondsPerDay;
const START_OFFSET = (BALANCE.time.startHour / 24) * TICKS_PER_DAY;

export interface Clock {
  day: number; // começa em 1
  hour: number;
  minute: number;
  dayFraction: number; // 0 = meia-noite, 0.5 = meio-dia
  season: Season;
  seasonIndex: number;
  year: number; // começa em 1
}

export function ticksPerDay(): number {
  return TICKS_PER_DAY;
}

export function getClock(tick: number): Clock {
  const total = tick + START_OFFSET;
  const dayIndex = Math.floor(total / TICKS_PER_DAY);
  const dayFraction = (total % TICKS_PER_DAY) / TICKS_PER_DAY;
  const minutes = Math.floor(dayFraction * 24 * 60);
  const seasonCount = Math.floor(dayIndex / BALANCE.time.daysPerSeason);
  return {
    day: dayIndex + 1,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    dayFraction,
    seasonIndex: seasonCount % 4,
    season: SEASONS[seasonCount % 4],
    year: Math.floor(seasonCount / 4) + 1,
  };
}

// Luz do dia em [0, 1]: 1 durante o dia, 0 à noite, com transição no amanhecer e anoitecer.
export function daylight(dayFraction: number): number {
  const hour = dayFraction * 24;
  const { dawnHour, duskHour } = BALANCE.time;
  const fade = 1.5;
  if (hour < dawnHour || hour >= duskHour + fade) return 0;
  if (hour < dawnHour + fade) return (hour - dawnHour) / fade;
  if (hour < duskHour) return 1;
  return 1 - (hour - duskHour) / fade;
}

export function formatClock(c: Clock): string {
  return `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

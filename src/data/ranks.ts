// Patentes dos soldados, do nível 1 ao 100: 20 postos (inspirados nas patentes do exército),
// cada um com 5 graus (I a V). Ex.: nível 1 = Recruta I, nível 18 = Cabo III, nível 100 = Comandante Supremo V.

export const RANK_TITLES = [
  'Recruta',
  'Soldado',
  'Soldado de Primeira Classe',
  'Cabo',
  'Terceiro-Sargento',
  'Segundo-Sargento',
  'Primeiro-Sargento',
  'Subtenente',
  'Aspirante',
  'Segundo-Tenente',
  'Primeiro-Tenente',
  'Capitão',
  'Major',
  'Tenente-Coronel',
  'Coronel',
  'General de Brigada',
  'General de Divisão',
  'General de Exército',
  'Marechal',
  'Comandante Supremo',
] as const;

const GRADES = ['I', 'II', 'III', 'IV', 'V'];

export const MAX_LEVEL = 100;

export function rankTitle(level: number): string {
  return RANK_TITLES[Math.floor((Math.min(MAX_LEVEL, Math.max(1, level)) - 1) / 5)];
}

export function rankName(level: number): string {
  const l = Math.min(MAX_LEVEL, Math.max(1, level));
  return `${rankTitle(l)} ${GRADES[(l - 1) % 5]}`;
}

// Experiência para passar do nível L para L+1 (sempre crescente).
export function xpToNext(level: number): number {
  return Math.round(10 + 6 * Math.pow(level, 1.5));
}

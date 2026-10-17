import type { Rng } from '../core/rng';

const FEMALE = [
  'Anna', 'Clara', 'Elsa', 'Greta', 'Ilse', 'Karla', 'Marta', 'Petra', 'Sofia', 'Ursula',
  'Wilma', 'Brunhild', 'Liesel', 'Hedwig', 'Frieda', 'Mathilde', 'Lotte', 'Agnes',
];

const MALE = [
  'Bertold', 'Dietrich', 'Friedrich', 'Heinrich', 'Johann', 'Lukas', 'Niklas', 'Otto', 'Rudolf', 'Theo',
  'Viktor', 'Anselm', 'Konrad', 'Matthias', 'Emil', 'Wilhelm', 'Kaspar', 'Gustav',
];

const LAST = [
  'Bauer', 'Fischer', 'Weber', 'Schmidt', 'Müller', 'Krause', 'Hoffmann', 'Wolf', 'Becker', 'Richter',
  'Klein', 'Braun', 'Zimmermann', 'Hartmann', 'Lang', 'Vogel', 'Stein', 'Brandt', 'Graf', 'Roth',
];

const FEMALE_SET = new Set(FEMALE);

export function randomName(rng: Rng): string {
  const first = rng.chance(0.5) ? rng.pick(FEMALE) : rng.pick(MALE);
  return `${first} ${rng.pick(LAST)}`;
}

// O gênero vem do primeiro nome (para a concordância nas mensagens).
export function isFemaleName(name: string): boolean {
  return FEMALE_SET.has(name.split(' ')[0]);
}

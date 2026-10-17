import type { Rng } from '../core/rng';

const FIRST = [
  'Anna', 'Bertold', 'Clara', 'Dietrich', 'Elsa', 'Friedrich', 'Greta', 'Heinrich', 'Ilse', 'Johann',
  'Karla', 'Lukas', 'Marta', 'Niklas', 'Otto', 'Petra', 'Rudolf', 'Sofia', 'Theo', 'Ursula',
  'Viktor', 'Wilma', 'Anselm', 'Brunhild', 'Konrad', 'Liesel', 'Matthias', 'Hedwig', 'Emil', 'Frieda',
];

const LAST = [
  'Bauer', 'Fischer', 'Weber', 'Schmidt', 'Müller', 'Krause', 'Hoffmann', 'Wolf', 'Becker', 'Richter',
  'Klein', 'Braun', 'Zimmermann', 'Hartmann', 'Lang', 'Vogel', 'Stein', 'Brandt', 'Graf', 'Roth',
];

export function randomName(rng: Rng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

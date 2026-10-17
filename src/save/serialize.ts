import { SAVE_VERSION, type GameState } from '../state';
import { migrate } from './migrations';

// Converte o estado em JSON e vice-versa. O mapa (Uint8Array) vira base64.

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state, (key, value) => {
    if (key === 'tiles' && value instanceof Uint8Array) return { $b64: bytesToBase64(value) };
    return value;
  });
}

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json, (key, value) => {
    if (key === 'tiles' && value && typeof value.$b64 === 'string') return base64ToBytes(value.$b64);
    return value;
  });
  if (typeof raw !== 'object' || raw === null || typeof raw.version !== 'number') {
    throw new Error('Arquivo de save inválido.');
  }
  if (raw.version > SAVE_VERSION) {
    throw new Error(`Save de uma versão mais nova do jogo (v${raw.version}).`);
  }
  return migrate(raw);
}

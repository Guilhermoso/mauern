import { SAVE_VERSION, type GameState } from '../state';
import type { ResourceNode, ResourceNodeKind } from '../entities/types';
import { migrate } from './migrations';

// Converte o estado em JSON e vice-versa. O mapa (Uint8Array) vira base64, e os recursos do mapa
// (milhares de árvores e jazidas) são gravados compactados: uma lista de números por recurso.
// Saves antigos, com os recursos no formato completo, continuam sendo lidos normalmente.

const NODE_KINDS: ResourceNodeKind[] = ['tree', 'berries', 'stone', 'iron', 'crystal'];

function packNodes(nodes: ResourceNode[]): { $nodes: number[] } {
  const out: number[] = [];
  for (const n of nodes) out.push(n.id, NODE_KINDS.indexOf(n.kind), n.tx, n.ty, Math.round(n.amount * 100) / 100, Math.round(n.variant * 1000));
  return { $nodes: out };
}

function unpackNodes(data: number[]): ResourceNode[] {
  const out: ResourceNode[] = [];
  for (let i = 0; i < data.length; i += 6) {
    out.push({ id: data[i], kind: NODE_KINDS[data[i + 1]], tx: data[i + 2], ty: data[i + 3], amount: data[i + 4], variant: data[i + 5] / 1000 });
  }
  return out;
}

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
    if ((key === 'tiles' || key === 'explored') && value instanceof Uint8Array) return { $b64: bytesToBase64(value) };
    if (key === 'resourceNodes' && Array.isArray(value)) return packNodes(value);
    return value;
  });
}

export function deserialize(json: string): GameState {
  const raw = JSON.parse(json, (key, value) => {
    if ((key === 'tiles' || key === 'explored') && value && typeof value.$b64 === 'string') return base64ToBytes(value.$b64);
    if (key === 'resourceNodes' && value && Array.isArray(value.$nodes)) return unpackNodes(value.$nodes);
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

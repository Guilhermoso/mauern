import { openDB, type IDBPDatabase } from 'idb';
import { BALANCE } from '../data/balance';
import type { GameState } from '../state';
import { getClock } from '../core/time';
import { deserialize, serialize } from './serialize';

// Saves no IndexedDB, com rotação de autosaves (o mais antigo é sobrescrito).

interface SaveRecord {
  slot: string;
  savedAt: number;
  day: number;
  json: string;
}

const DB_NAME = 'mauern';
const STORE = 'saves';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE, { keyPath: 'slot' });
    },
  });
  return dbPromise;
}

const slots = Array.from({ length: BALANCE.save.rotation }, (_, i) => `auto-${i}`);

async function allRecords(): Promise<SaveRecord[]> {
  const d = await db();
  const records = (await d.getAll(STORE)) as SaveRecord[];
  return records.filter((r) => slots.includes(r.slot)).sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveGame(state: GameState): Promise<void> {
  const records = await allRecords();
  const used = new Set(records.map((r) => r.slot));
  // Usa um slot vazio, ou sobrescreve o save mais antigo.
  const slot = slots.find((s) => !used.has(s)) ?? records[records.length - 1].slot;
  const record: SaveRecord = { slot, savedAt: Date.now(), day: getClock(state.tick).day, json: serialize(state) };
  const d = await db();
  await d.put(STORE, record);
}

// Carrega o save mais recente que estiver íntegro. Se um estiver corrompido, tenta o anterior.
export async function loadLatest(): Promise<{ state: GameState; warning?: string } | null> {
  const records = await allRecords();
  let skipped = 0;
  for (const r of records) {
    try {
      const state = deserialize(r.json);
      const warning = skipped > 0 ? `${skipped} save(s) corrompido(s) ignorado(s); carregado o save do dia ${r.day}.` : undefined;
      return { state, warning };
    } catch (err) {
      console.error('Save corrompido em', r.slot, err);
      skipped++;
    }
  }
  return null;
}

export async function clearSaves(): Promise<void> {
  const d = await db();
  await d.clear(STORE);
}

export function exportSave(state: GameState): void {
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mauern-dia-${getClock(state.tick).day}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSaveFile(): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('Nenhum arquivo escolhido.'));
      try {
        resolve(deserialize(await file.text()));
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}

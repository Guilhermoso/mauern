import { describe, expect, it } from 'vitest';
import { createNewGame, SAVE_VERSION } from '../src/state';
import { deserialize, serialize } from '../src/save/serialize';
import { step } from '../src/core/simulation';
import { Sim } from '../src/core/sim';

describe('save', () => {
  it('serializa e restaura o estado completo', () => {
    const s = createNewGame('save');
    const sim = new Sim(s);
    for (let i = 0; i < 5000; i++) step(sim);
    s.resources.wood = 321;
    const restored = deserialize(serialize(s));
    expect(restored).toEqual(s);
    expect(restored.world.tiles).toBeInstanceOf(Uint8Array);
  });

  it('o save é compacto o bastante (mapa em base64)', () => {
    const json = serialize(createNewGame('tamanho'));
    expect(json.length).toBeLessThan(2_000_000);
  });

  it('rejeita arquivos inválidos', () => {
    expect(() => deserialize('{"foo":1}')).toThrow();
    expect(() => deserialize('isto não é json')).toThrow();
  });

  it('rejeita saves de versões futuras', () => {
    const s = createNewGame('futuro');
    const json = serialize({ ...s, version: SAVE_VERSION + 1 });
    expect(() => deserialize(json)).toThrow(/versão mais nova/);
  });
});

describe('simulação', () => {
  it('registra o amanhecer de um novo dia no diário', () => {
    const s = createNewGame('dia');
    const sim = new Sim(s);
    const before = s.log.length;
    // A partida começa às 7h; 17h depois já é o dia 2.
    for (let i = 0; i < 4800; i++) step(sim);
    expect(s.log.length).toBe(before + 1);
    expect(s.log[s.log.length - 1].text).toContain('Dia 2');
  });
});

describe('migrações', () => {
  it('converte um save v1 (etapa 1) para a versão atual', () => {
    const s = createNewGame('antigo');
    const v1: any = JSON.parse(serialize(s));
    v1.version = 1;
    for (const b of v1.buildings) {
      delete b.built; delete b.progress; delete b.queue; delete b.rally; delete b.farmerId;
    }
    for (const u of v1.units) {
      delete u.order; delete u.path; delete u.pathKey; delete u.pathComplete; delete u.carry; delete u.work; delete u.moving;
    }
    delete v1.titans; delete v1.threat; delete v1.alarm;
    delete v1.battalions; delete v1.battalionCount;
    delete v1.era; delete v1.techs; delete v1.relics; delete v1.morale; delete v1.moraleMods; delete v1.stats; delete v1.city; delete v1.events;
    const migrated = deserialize(JSON.stringify(v1));
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.titans).toEqual([]);
    expect(migrated.units[0].garrison).toBe(0);
    expect(migrated.threat.nextSpawnTick).toBeGreaterThan(migrated.tick);
    expect(migrated.buildings[0].level).toBe(1);
    expect(migrated.stats.titansKilled).toBe(0);
    expect(migrated.morale).toBe(60);
    expect(migrated.battalions).toEqual([]);
    expect(migrated.units[0].level).toBe(1);
    expect(migrated.buildings[0].built).toBe(true);
    expect(migrated.units[0].order).toEqual({ type: 'idle' });
    // O jogo migrado roda normalmente.
    const sim = new Sim(migrated);
    for (let i = 0; i < 100; i++) step(sim);
  });
});

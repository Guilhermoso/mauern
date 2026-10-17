import { describe, expect, it } from 'vitest';
import { createNewGame, SAVE_VERSION } from '../src/state';
import { deserialize, serialize } from '../src/save/serialize';
import { step } from '../src/core/simulation';

describe('save', () => {
  it('serializa e restaura o estado completo', () => {
    const s = createNewGame('save');
    for (let i = 0; i < 5000; i++) step(s);
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
    const before = s.log.length;
    // A partida começa às 7h; 17h depois já é o dia 2.
    for (let i = 0; i < 4800; i++) step(s);
    expect(s.log.length).toBe(before + 1);
    expect(s.log[s.log.length - 1].text).toContain('Dia 2');
  });
});

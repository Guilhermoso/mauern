import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { step } from '../src/core/simulation';
import { BALANCE } from '../src/data/balance';
import { createNewGame, newBuilding, newUnit, SAVE_VERSION, type GameState } from '../src/state';
import type { Poi, PoiKind } from '../src/entities/types';
import { updateFog } from '../src/systems/fog';
import { readLore } from '../src/systems/expeditions';
import { isGateOpen } from '../src/systems/gates';
import { damageUnit } from '../src/systems/damage';
import { serialize, deserialize } from '../src/save/serialize';
import { addTitan, addVillager, CENTER, flatGame, runSeconds, setNoon } from './helpers';

const TS = BALANCE.world.tileSize;
const P = BALANCE.pois;

function withPoi(kind: PoiKind, tx: number, ty: number, value = 0): { s: GameState; poi: Poi } {
  const s = flatGame();
  setNoon(s);
  const poi: Poi = { id: 1, kind, tx, ty, discovered: false, done: false, progress: 0, value };
  s.pois = [poi];
  return { s, poi };
}

function soldier(s: GameState, tx: number, ty: number, level = 10) {
  const u = newUnit(s.nextId++, 'militia', `Soldado ${s.nextId}`, (tx + 0.5) * TS, (ty + 0.5) * TS);
  u.level = level;
  u.hp = 9999;
  s.units.push(u);
  return u;
}

describe('névoa de guerra', () => {
  it('no começo só a área perto da vila é conhecida; explorar revela o resto', () => {
    const s = flatGame();
    setNoon(s);
    const w = s.world.width;
    expect(s.explored[CENTER * w + CENTER]).toBe(1);
    expect(s.explored[CENTER * w + CENTER + 60]).toBe(0);
    const scout = newUnit(s.nextId++, 'scout', 'Batedor', (CENTER + 60.5) * TS, (CENTER + 0.5) * TS);
    s.units.push(scout);
    const sim = new Sim(s);
    updateFog(sim, true);
    expect(s.explored[CENTER * w + CENTER + 60]).toBe(1);
    expect(sim.visible[CENTER * w + CENTER + 60]).toBe(1);
    // Saiu dali: continua explorado, mas não mais à vista.
    scout.x = (CENTER + 0.5) * TS;
    updateFog(sim, true);
    expect(s.explored[CENTER * w + CENTER + 60]).toBe(1);
    expect(sim.visible[CENTER * w + CENTER + 60]).toBe(0);
  });

  it('o mapa explorado sobrevive ao salvar e carregar', () => {
    const s = flatGame();
    s.explored[123] = 1;
    const back = deserialize(serialize(s));
    expect(back.explored).toBeInstanceOf(Uint8Array);
    expect(back.explored[123]).toBe(1);
    expect(back.explored.length).toBe(s.explored.length);
  });
});

describe('pontos de interesse', () => {
  it('são gerados fora dos muros, sempre iguais para a mesma seed', () => {
    const a = createNewGame('mauern-poi');
    const b = createNewGame('mauern-poi');
    expect(a.pois.length).toBeGreaterThanOrEqual(15);
    expect(a.pois).toEqual(b.pois);
    for (const p of a.pois) expect(Math.hypot(p.tx - CENTER, p.ty - CENTER)).toBeGreaterThanOrEqual(P.minDistance - 1);
    // Jazidas valiosas têm ferro rico em volta.
    const dep = a.pois.find((p) => p.kind === 'deposit')!;
    const rich = a.world.resourceNodes.filter((n) => n.kind === 'iron' && Math.abs(n.tx - dep.tx) <= 2 && Math.abs(n.ty - dep.ty) <= 2);
    expect(rich.length).toBeGreaterThan(0);
    expect(rich[0].amount).toBe(BALANCE.resources.ironAmount * P.depositAmountMult);
  });

  it('são descobertos quando entram na visão', () => {
    const { s, poi } = withPoi('ruins', CENTER + 40, CENTER);
    const sim = new Sim(s);
    updateFog(sim, true);
    expect(poi.discovered).toBe(false);
    addVillager(s, CENTER + 38, CENTER);
    updateFog(sim, true);
    expect(poi.discovered).toBe(true);
    expect(s.log.some((l) => l.text.startsWith('Descoberta a leste'))).toBe(true);
  });

  it('ruínas: ficar lá vasculha e traz o saque', () => {
    const { s, poi } = withPoi('ruins', CENTER + 40, CENTER, 1);
    addVillager(s, CENTER + 40, CENTER);
    const gold0 = s.resources.gold;
    const sim = new Sim(s);
    runSeconds(sim, P.ruinsSearchSeconds + 1);
    expect(poi.done).toBe(true);
    expect(s.resources.gold).toBe(gold0 + (P.ruinsLoot[1].gold ?? 0));
    expect(s.moraleMods.some((m) => m.reason === 'Expedições bem-sucedidas')).toBe(true);
  });

  it('sobreviventes: o contato os traz para a vila como aldeões', () => {
    const { s, poi } = withPoi('survivors', CENTER + 40, CENTER, 3);
    addVillager(s, CENTER + 40, CENTER + 1);
    const n0 = s.units.length;
    const sim = new Sim(s);
    runSeconds(sim, 1);
    expect(poi.done).toBe(true);
    expect(s.units.length).toBe(n0 + 3);
    const rescued = s.units.slice(n0);
    expect(rescued.every((u) => u.kind === 'villager' && u.order.type === 'move')).toBe(true);
  });

  it('ninho: tem guardiões e é destruído por soldados sem titãs por perto', () => {
    const { s, poi } = withPoi('nest', CENTER + 50, CENTER);
    const sim = new Sim(s);
    const scout = newUnit(s.nextId++, 'scout', 'Batedor', (CENTER + 44.5) * TS, (CENTER + 0.5) * TS);
    s.units.push(scout);
    updateFog(sim, true);
    expect(poi.discovered).toBe(true);
    expect(s.titans.length).toBe(P.nestGuards);
    // Com titãs por perto, não avança.
    s.units.splice(s.units.indexOf(scout), 1);
    soldier(s, CENTER + 50, CENTER + 1);
    poi.progress = 0;
    for (let i = 0; i < 20; i++) step(sim);
    expect(poi.progress).toBe(0);
    // Sem titãs: limpa.
    s.titans = [];
    runSeconds(sim, P.nestClearSeconds + 1);
    expect(poi.done).toBe(true);
  });

  it('local de história: ler revela um fragmento', () => {
    const { s, poi } = withPoi('lore', CENTER + 40, CENTER, 2);
    addVillager(s, CENTER + 40, CENTER);
    const sim = new Sim(s);
    runSeconds(sim, P.loreReadSeconds + 1);
    expect(poi.done).toBe(true);
    expect(readLore(sim)).toEqual([2]);
  });
});

describe('memorial', () => {
  it('cada morte fica registrada com nome, causa e abates', () => {
    const s = flatGame();
    setNoon(s, 3);
    const u = soldier(s, CENTER + 5, CENTER + 5, 12);
    u.kills = 7;
    u.hp = 5;
    const sim = new Sim(s);
    damageUnit(sim, u, 50, true);
    expect(s.memorial).toHaveLength(1);
    expect(s.memorial[0]).toMatchObject({ name: u.name, kind: 'militia', day: 3, level: 12, kills: 7 });
    expect(s.memorial[0].cause).toMatch(/devorad/);
  });
});

describe('portões', () => {
  it('abrem quando alguém passa e fecham sozinhos depois', () => {
    const s = flatGame();
    setNoon(s);
    const gate = newBuilding(s.nextId++, 'gate', CENTER + 10, CENTER, true);
    s.buildings.push(gate);
    const v = addVillager(s, CENTER + 10, CENTER);
    const sim = new Sim(s);
    runSeconds(sim, 0.5);
    expect(isGateOpen(sim, gate)).toBe(true);
    v.x = (CENTER + 3) * TS;
    runSeconds(sim, BALANCE.titans.gateOpenSeconds + 0.5);
    expect(isGateOpen(sim, gate)).toBe(false);
  });

  it('um titã atravessa um portão aberto sem quebrá-lo', () => {
    const s = flatGame();
    setNoon(s);
    // Muralha vertical inteira com um portão no meio.
    for (let y = 0; y < s.world.height; y++) {
      const b = newBuilding(s.nextId++, y === CENTER ? 'gate' : 'palisade', CENTER + 12, y, true);
      s.buildings.push(b);
    }
    const gate = s.buildings.find((b) => b.kind === 'gate')!;
    const hp0 = gate.hp;
    const t = addTitan(s, CENTER + 22, CENTER, 4);
    const sim = new Sim(s);
    // Portão mantido aberto (como se alguém passasse o tempo todo); o titã marcha para o Centro da Vila.
    for (let i = 0; i < 25 * BALANCE.time.ticksPerSecond; i++) {
      sim.gateOpenUntil.set(gate.id, s.tick + 10);
      step(sim);
    }
    expect(t.x / TS).toBeLessThan(CENTER + 12);
    expect(gate.hp).toBe(hp0);
    expect(s.buildings.includes(gate)).toBe(true);
  });
});

describe('save', () => {
  it('migra saves v8 com névoa, pontos de interesse e memorial', () => {
    const raw = JSON.parse(serialize(createNewGame('migra')));
    raw.version = 8;
    delete raw.pois;
    delete raw.memorial;
    delete raw.explored;
    const back = deserialize(JSON.stringify(raw));
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.memorial).toEqual([]);
    expect(back.pois.length).toBeGreaterThan(0);
    expect(back.explored).toBeInstanceOf(Uint8Array);
    const w = back.world.width;
    expect(back.explored[(w / 2) * w + w / 2]).toBe(1);
  });
});

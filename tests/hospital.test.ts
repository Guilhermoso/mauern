import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { BALANCE } from '../src/data/balance';
import { newBuilding, newUnit, type GameState } from '../src/state';
import { commandHospital, dismissDoctors, doctors, freeBeds, hospitalBeds, patients, startHospitalUpgrade, upgradeTime } from '../src/systems/hospital';
import { battalionCommand, battalionOf, formBattalion, isCritical, toggleCritical } from '../src/systems/battalions';
import { unitMaxHp } from '../src/systems/modifiers';
import { addVillager, CENTER, flatGame, runSeconds, setNoon } from './helpers';

const TS = BALANCE.world.tileSize;

function setup() {
  const s = flatGame();
  setNoon(s);
  s.resources = { food: 5000, wood: 5000, stone: 5000, iron: 0, gold: 5000, wool: 0, bread: 0, clothes: 0 };
  const h = newBuilding(s.nextId++, 'hospital', CENTER + 8, CENTER - 2, true);
  s.buildings.push(h);
  const sim = new Sim(s);
  return { s, sim, h };
}

function soldier(s: GameState, tx: number, ty: number, hpFrac = 0.2, level = 1) {
  const u = newUnit(s.nextId++, 'militia', 'Otto Bauer', (tx + 0.5) * TS, (ty + 0.5) * TS);
  u.level = level;
  u.hp = unitMaxHp(s, u) * hpFrac;
  s.units.push(u);
  return u;
}

describe('hospital de milícia', () => {
  it('leitos crescem com o nível: 20 por nível, até 100', () => {
    const { sim, h } = setup();
    expect(hospitalBeds(h)).toBe(20);
    for (let l = 1; l < BALANCE.hospital.maxLevel; l++) {
      expect(startHospitalUpgrade(sim, h.id)).toBeNull();
      runSeconds(sim, upgradeTime(h) + 1);
    }
    expect(hospitalBeds(h)).toBe(100);
    expect(startHospitalUpgrade(sim, h.id)).toMatch(/máximo/);
  });

  it('até 3 médicos; cada um cura um soldado por vez; curados saem sozinhos', () => {
    const { s, sim, h } = setup();
    const vs = [0, 1, 2, 3].map((i) => addVillager(s, CENTER + 4 + i, CENTER + 4));
    expect(commandHospital(sim, vs.map((v) => v.id), h.id)).toMatch(/3 médicos/);
    const wounded = [0, 1, 2, 3, 4].map((i) => soldier(s, CENTER + 4 + i, CENTER + 6));
    commandHospital(sim, wounded.map((u) => u.id), h.id);
    runSeconds(sim, 8);
    expect(doctors(sim, h)).toHaveLength(3);
    expect(patients(sim, h)).toHaveLength(5);
    // Só 3 pacientes estão sendo curados ao mesmo tempo.
    const hp0 = wounded.map((u) => u.hp);
    runSeconds(sim, 2);
    const gained = wounded.filter((u, i) => u.hp > hp0[i]).length;
    expect(gained).toBe(3);
    runSeconds(sim, 120);
    expect(wounded.every((u) => u.garrison === 0 && u.hp === unitMaxHp(s, u))).toBe(true);
    expect(doctors(sim, h)).toHaveLength(3); // médicos ficam
    dismissDoctors(sim, h.id);
    expect(doctors(sim, h)).toHaveLength(0);
  });

  it('sem médicos ninguém é curado', () => {
    const { s, sim, h } = setup();
    const u = soldier(s, CENTER + 5, CENTER + 5);
    commandHospital(sim, [u.id], h.id);
    runSeconds(sim, 6);
    const hp = u.hp;
    expect(u.garrison).toBe(h.id);
    runSeconds(sim, 10);
    expect(u.hp).toBe(hp);
  });

  it('não interna além dos leitos', () => {
    const { s, sim, h } = setup();
    const many = Array.from({ length: 25 }, (_, i) => soldier(s, CENTER + 2 + (i % 5), CENTER + 6 + Math.floor(i / 5)));
    expect(commandHospital(sim, many.map((u) => u.id), h.id)).toMatch(/leitos/);
    runSeconds(sim, 15);
    expect(patients(sim, h).length).toBe(20);
  });
});

describe('estado crítico dos batalhões', () => {
  it('por padrão só o comandante dispara o estado crítico; dá para marcar outros', () => {
    const { s, sim } = setup();
    const c = soldier(s, CENTER - 6, CENTER + 6, 1, 10);
    const m = soldier(s, CENTER - 5, CENTER + 6, 0.1);
    const { battalion } = formBattalion(sim, [c.id, m.id]);
    const b = battalionOf(sim, battalion!.id)!;
    expect(isCritical(sim, b)).toBe(false);
    toggleCritical(sim, b.id, m.id);
    expect(isCritical(sim, b)).toBe(true);
  });

  it('em estado crítico o batalhão corre para o hospital e entra junto; sai junto quando todos sararem', () => {
    const { s, sim, h } = setup();
    const docs = [0, 1, 2].map((i) => addVillager(s, CENTER + 4 + i, CENTER + 4));
    commandHospital(sim, docs.map((v) => v.id), h.id);
    const c = soldier(s, CENTER - 8, CENTER + 8, 0.2, 10);
    const ms = [1, 2, 3].map((i) => soldier(s, CENTER - 8 + i, CENTER + 8, 0.9));
    const { battalion } = formBattalion(sim, [c.id, ...ms.map((u) => u.id)]);
    runSeconds(sim, 1);
    expect(battalionOf(sim, battalion!.id)!.order.type).toBe('hospital');
    runSeconds(sim, 30);
    const b = battalionOf(sim, battalion!.id)!;
    expect(b.inHospital).toBe(h.id);
    expect([c, ...ms].every((u) => u.garrison === h.id)).toBe(true);
    runSeconds(sim, 120);
    expect(b.inHospital).toBe(0);
    expect([c, ...ms].every((u) => u.garrison === 0 && u.hp === unitMaxHp(s, u))).toBe(true);
  });

  it('não entra se não houver leitos para o batalhão inteiro', () => {
    const { s, sim, h } = setup();
    // Ocupa 18 dos 20 leitos.
    for (let i = 0; i < 18; i++) soldier(s, CENTER + 30, CENTER + 30, 0.5).garrison = h.id;
    const c = soldier(s, CENTER - 8, CENTER + 8, 0.2, 10);
    const ms = [1, 2, 3].map((i) => soldier(s, CENTER - 8 + i, CENTER + 8, 0.9));
    const { battalion } = formBattalion(sim, [c.id, ...ms.map((u) => u.id)]);
    expect(freeBeds(sim, h)).toBe(2);
    runSeconds(sim, 30);
    const b = battalionOf(sim, battalion!.id)!;
    expect(b.order.type).not.toBe('hospital');
    expect(b.inHospital).toBe(0);
    expect(sim.alerts.some((a) => a.text.includes('leitos'))).toBe(true);
  });

  it('clique direito no hospital com o batalhão o leva para lá', () => {
    const { s, sim, h } = setup();
    const c = soldier(s, CENTER - 8, CENTER + 8, 0.9, 10);
    const m = soldier(s, CENTER - 7, CENTER + 8, 0.9);
    const { battalion } = formBattalion(sim, [c.id, m.id]);
    battalionCommand(sim, battalion!.id, (h.tx + 1.5) * TS, (h.ty + 1.5) * TS);
    expect(battalionOf(sim, battalion!.id)!.order.type).toBe('hospital');
  });
});

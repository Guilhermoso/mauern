import { describe, expect, it } from 'vitest';
import { Sim } from '../src/core/sim';
import { BALANCE } from '../src/data/balance';
import { newBuilding, newUnit, type GameState } from '../src/state';
import { formBattalion, formationSlot, setFormation, setMode } from '../src/systems/battalions';
import { buffFraction, honorBonus, honors, unitAttack, unitBaseHp, unitMaxHp } from '../src/systems/modifiers';
import { ennoble, payNobles } from '../src/systems/nobility';
import { hitTitan } from '../src/systems/combat';
import { damageUnit, killUnit } from '../src/systems/damage';
import { trainingRate } from '../src/systems/soldiers';
import { moraleTarget } from '../src/systems/city';
import { migrate } from '../src/save/migrations';
import { SAVE_VERSION } from '../src/state';
import { addTitan, CENTER, flatGame, runSeconds, setNoon } from './helpers';

const TS = BALANCE.world.tileSize;
const N = BALANCE.nobility;
const L = BALANCE.legend;

function soldier(s: GameState, tx: number, ty: number, level = 1) {
  const u = newUnit(s.nextId++, 'militia', `Soldado ${s.nextId}`, (tx + 0.5) * TS, (ty + 0.5) * TS);
  u.level = level;
  s.units.push(u);
  return u;
}

function full(sim: Sim, ...us: ReturnType<typeof soldier>[]) {
  for (const u of us) u.hp = unitMaxHp(sim.state, u);
}

describe('nobreza', () => {
  it('só militares de nível 70+ recebem o título, por 500 de ouro', () => {
    const s = flatGame();
    const low = soldier(s, CENTER + 5, CENTER + 5, 69);
    const high = soldier(s, CENTER + 30, CENTER + 5, 70);
    s.resources.gold = 600;
    const sim = new Sim(s);
    expect(ennoble(sim, low.id)).not.toBeNull();
    expect(ennoble(sim, high.id)).toBeNull();
    expect(high.noble).toBe(true);
    expect(s.resources.gold).toBe(100);
    expect(ennoble(sim, high.id)).not.toBeNull();
  });

  it('nobre ganha +50 de vida base e +5 de dano base (lança dourada)', () => {
    const s = flatGame();
    const u = soldier(s, CENTER + 30, CENTER + 30, 70);
    s.resources.gold = 1000;
    const sim = new Sim(s);
    const hp0 = unitBaseHp(s, u);
    const atk0 = unitAttack(s, u);
    ennoble(sim, u.id);
    const lvl = 1 + BALANCE.soldiers.hpPerLevel * 69;
    expect(unitBaseHp(s, u)).toBeCloseTo(hp0 + N.extraHp * lvl, 5);
    expect(unitAttack(s, u)).toBeCloseTo(atk0 + N.lanceDamage * (1 + BALANCE.soldiers.attackPerLevel * 69), 5);
  });

  it('comandante nobre: +10% no comando, vale para si, e o batalhão anda 5% mais rápido', () => {
    const s = flatGame();
    setNoon(s);
    const c = soldier(s, CENTER + 5, CENTER + 5, 80);
    const m = soldier(s, CENTER + 6, CENTER + 5, 1);
    s.resources.gold = 1000;
    const sim = new Sim(s);
    formBattalion(sim, [c.id, m.id]);
    const per = BALANCE.soldiers.leadershipPerLevel;
    expect(buffFraction(s, c)).toBe(0);
    ennoble(sim, c.id);
    expect(buffFraction(s, c)).toBeCloseTo(80 * per + N.leadershipBonus, 6);
    // O membro: comando com o fixo + aura do nobre (5%).
    expect(buffFraction(s, m)).toBeCloseTo(80 * per + N.leadershipBonus + N.auraBonus, 6);
    runSeconds(sim, 0.2);
    expect(m.speedBonus).toBe(N.battalionSpeed);
    expect(c.speedBonus).toBe(N.battalionSpeed);
  });

  it('aura do nobre: +5% para militares por perto (inclusive outros nobres), sem acumular', () => {
    const s = flatGame();
    const a = soldier(s, CENTER + 5, CENTER + 5, 70);
    const b = soldier(s, CENTER + 7, CENTER + 5, 70);
    const c = soldier(s, CENTER + 6, CENTER + 6, 1);
    const far = soldier(s, CENTER + 40, CENTER + 40, 1);
    s.resources.gold = 2000;
    const sim = new Sim(s);
    ennoble(sim, a.id);
    ennoble(sim, b.id);
    expect(buffFraction(s, a)).toBeCloseTo(N.auraBonus, 6);
    expect(buffFraction(s, c)).toBeCloseTo(N.auraBonus, 6); // dois nobres perto: vale uma vez
    expect(buffFraction(s, far)).toBe(0);
  });

  it('soldo diário e moral: falta de ouro e morte do nobre derrubam a moral', () => {
    const s = flatGame();
    const u = soldier(s, CENTER + 5, CENTER + 5, 70);
    s.resources.gold = 500 + 30;
    const sim = new Sim(s);
    ennoble(sim, u.id);
    payNobles(sim);
    expect(s.resources.gold).toBe(5);
    payNobles(sim);
    expect(s.resources.gold).toBe(0);
    expect(moraleTarget(sim).parts.some((p) => p.label === 'Nobres sem soldo')).toBe(true);
    killUnit(sim, u, ['morto', 'morta']);
    const mourning = moraleTarget(sim).parts.find((p) => p.label.startsWith('Morte de um') && p.label.includes('nobre'));
    expect(mourning?.value).toBe(N.deathMorale);
  });

  it('treinador nobre: +5 de experiência por segundo para os alunos', () => {
    const s = flatGame();
    const t = soldier(s, CENTER + 5, CENTER + 5, 70);
    const st = soldier(s, CENTER + 6, CENTER + 5, 1);
    const before = trainingRate(t, st);
    t.noble = true;
    expect(trainingRate(t, st)).toBeCloseTo(before + N.trainerXp, 6);
  });

  it('o nobre e seu batalhão são curados primeiro no hospital', () => {
    const s = flatGame();
    const h = newBuilding(s.nextId++, 'hospital', CENTER + 6, CENTER - 8, true);
    s.buildings.push(h);
    const doc = newUnit(s.nextId++, 'villager', 'Anna Bauer', 0, 0);
    s.units.push(doc);
    h.doctorIds = [doc.id];
    doc.garrison = h.id;
    const plain = soldier(s, CENTER, CENTER, 10);
    const noble = soldier(s, CENTER, CENTER, 70);
    noble.noble = true;
    const sim = new Sim(s);
    for (const u of [plain, noble]) {
      u.garrison = h.id;
      u.hp = 10;
    }
    runSeconds(sim, 1);
    expect(noble.hp).toBeGreaterThan(10);
    expect(plain.hp).toBe(10);
  });
});

describe('honras', () => {
  it('uma honra a cada 10 titãs; +2% cada; na décima, +30% no total', () => {
    const s = flatGame();
    const u = soldier(s, CENTER + 5, CENTER + 5, 1);
    u.kills = 9;
    expect(honors(u)).toBe(0);
    u.kills = 10;
    expect(honors(u)).toBe(1);
    expect(honorBonus(u)).toBeCloseTo(0.02, 6);
    u.kills = 95;
    expect(honorBonus(u)).toBeCloseTo(0.18, 6);
    u.kills = 100;
    expect(honorBonus(u)).toBeCloseTo(0.3, 6);
    u.kills = 500;
    expect(honors(u)).toBe(10);
  });

  it('abater um titã conta para o soldado', () => {
    const s = flatGame();
    setNoon(s);
    const u = soldier(s, CENTER + 5, CENTER + 5, 1);
    const t = addTitan(s, CENTER + 20, CENTER + 20);
    const sim = new Sim(s);
    hitTitan(sim, t, 1e6, u);
    expect(u.kills).toBe(1);
  });
});

describe('bônus sempre sobre o valor base', () => {
  it('5% + 10% = +15% sobre a base, não 1,05 × 1,10', () => {
    const s = flatGame();
    const u = soldier(s, CENTER + 5, CENTER + 5, 1);
    const noble = soldier(s, CENTER + 6, CENTER + 5, 70);
    soldier(s, CENTER + 7, CENTER + 5, 100);
    noble.noble = true;
    const base = unitBaseHp(s, u);
    expect(unitMaxHp(s, u)).toBe(Math.round(base * (1 + N.auraBonus + L.auraBonus)));
  });
});

describe('lenda', () => {
  it('intimida titãs no alcance: dano recebido conta 1/0,95 e golpe 10% mais fraco', () => {
    const s = flatGame();
    setNoon(s);
    const legend = soldier(s, CENTER + 5, CENTER + 5, 100);
    const t = addTitan(s, CENTER + 8, CENTER + 5);
    const far = addTitan(s, CENTER + 60, CENTER + 60);
    const sim = new Sim(s);
    runSeconds(sim, 0.05);
    expect(sim.intimidated.has(t.id)).toBe(true);
    expect(sim.intimidated.has(far.id)).toBe(false);
    const hp = t.hp;
    hitTitan(sim, t, 19);
    expect(hp - t.hp).toBeCloseTo(19 / (1 - L.titanHpReduction), 5);
    void legend;
  });

  it('escudo de 30 que recarrega após 20 s fora de combate; o batalhão ganha escudo de 10 (60 s)', () => {
    const s = flatGame();
    setNoon(s, 2);
    const legend = soldier(s, CENTER + 5, CENTER + 5, 100);
    const m = soldier(s, CENTER + 6, CENTER + 5, 1);
    const sim = new Sim(s);
    formBattalion(sim, [legend.id, m.id]);
    full(sim, legend, m);
    runSeconds(sim, 0.1);
    expect(legend.shield).toBe(L.shield);
    expect(m.shield).toBe(L.battalionShield);
    const hp = legend.hp;
    damageUnit(sim, legend, 20, true);
    expect(legend.shield).toBe(10);
    expect(legend.hp).toBe(hp);
    damageUnit(sim, legend, 15, true);
    expect(legend.shield).toBe(0);
    expect(legend.hp).toBe(hp - 5);
    damageUnit(sim, m, 4, true);
    runSeconds(sim, L.shieldRecharge - 1);
    expect(legend.shield).toBe(0);
    runSeconds(sim, 1.5);
    expect(legend.shield).toBe(L.shield);
    expect(m.shield).toBe(L.battalionShield - 4);
    runSeconds(sim, L.battalionShieldRecharge - L.shieldRecharge);
    expect(m.shield).toBe(L.battalionShield);
  });

  it('treinador lenda: +5 de experiência por segundo (soma com a nobreza)', () => {
    const s = flatGame();
    const t = soldier(s, CENTER + 5, CENTER + 5, 99);
    const st = soldier(s, CENTER + 6, CENTER + 5, 1);
    const at99 = trainingRate(t, st);
    t.level = 100;
    const base100 = BALANCE.soldiers.trainingXpPerSecond * (1 + 100 * BALANCE.soldiers.trainerBonusPerLevel);
    expect(trainingRate(t, st)).toBeCloseTo(base100 + L.trainerXp, 6);
    t.noble = true;
    expect(trainingRate(t, st)).toBeCloseTo(base100 + L.trainerXp + N.trainerXp, 6);
    expect(at99).toBeLessThan(base100);
  });
});

describe('batalhões: caça e formações', () => {
  it('no modo caçar, todos ganham 1 de experiência por segundo a cada 20 níveis do comandante', () => {
    const s = flatGame();
    setNoon(s);
    const c = soldier(s, CENTER + 5, CENTER + 5, 60);
    const m = soldier(s, CENTER + 6, CENTER + 5, 50); // nível alto: não sobe de nível em 10 s
    const sim = new Sim(s);
    const { battalion } = formBattalion(sim, [c.id, m.id]);
    setMode(sim, battalion!.id, 'hunt');
    runSeconds(sim, 10);
    expect(m.level).toBe(50);
    expect(m.xp).toBeCloseTo(30, 0);
  });

  it('formações só a partir do comandante nível 40', () => {
    const s = flatGame();
    const c = soldier(s, CENTER + 5, CENTER + 5, 39);
    const ms = [1, 2, 3, 4].map((i) => soldier(s, CENTER + 5 + i, CENTER + 6, 1));
    const sim = new Sim(s);
    const b = formBattalion(sim, [c.id, ...ms.map((m) => m.id)]).battalion!;
    expect(setFormation(sim, b.id, 'column')).not.toBeNull();
    c.level = 40;
    expect(setFormation(sim, b.id, 'column')).toBeNull();
    c.facing = 0;
    // Coluna: todos atrás do comandante, na mesma linha.
    for (let i = 0; i < 4; i++) {
      const p = formationSlot(sim, b, c, i);
      expect(p.y).toBeCloseTo(c.y, 5);
      expect(p.x).toBeCloseTo(c.x - (i + 1) * BALANCE.soldiers.formationSpacing, 5);
    }
    setFormation(sim, b.id, 'line');
    const xs = [0, 1, 2, 3].map((i) => formationSlot(sim, b, c, i).x);
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(1);
  });
});

describe('save', () => {
  it('migra saves v7 com os campos novos', () => {
    const s: any = JSON.parse(JSON.stringify(flatGame()));
    s.version = 7;
    s.units = [{ id: 1, kind: 'militia', level: 5 }];
    s.battalions = [{ id: 2, commanderId: 1, memberIds: [] }];
    const m = migrate(s);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.units[0]).toMatchObject({ noble: false, kills: 0, shield: 0, lastCombatTick: 0, speedBonus: 0 });
    expect(m.battalions[0].formation).toBe('block');
  });
});

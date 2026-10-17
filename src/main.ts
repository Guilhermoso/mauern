import { Application, Container } from 'pixi.js';
import './ui/style.css';
import { BALANCE } from './data/balance';
import { hashString, randomSeed } from './core/rng';
import { FixedLoop } from './core/loop';
import { step } from './core/simulation';
import { Sim } from './core/sim';
import { getClock } from './core/time';
import { createNewGame, type GameState } from './state';
import { clearSaves, exportSave, importSaveFile, loadLatest, saveGame } from './save/storage';
import { Camera } from './render/camera';
import { TerrainLayer } from './render/terrainLayer';
import { EntityLayer } from './render/entityLayer';
import { Lighting } from './render/lighting';
import { OverlayLayer } from './render/overlayLayer';
import { FxLayer } from './render/fxLayer';
import { bell, horn, setSoundEnabled, soundEnabled, thud, unlockAudioOnGesture } from './audio/sfx';
import type { Alert } from './core/sim';
import { spawnTitanNear } from './systems/titans';
import { CameraInput, isTyping } from './input/cameraInput';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Menu } from './ui/menu';
import { DebugPanel } from './ui/debug';
import { BottomPanel } from './ui/bottomPanel';
import { SelectionController } from './input/selection';

const EDGE_PAN_KEY = 'mauern.edgePan';
const SOUND_KEY = 'mauern.sound';

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível */
  }
}

async function boot(): Promise<void> {
  let state: GameState;
  let loadWarning: string | undefined;
  try {
    const loaded = await loadLatest();
    state = loaded?.state ?? createNewGame(randomSeed());
    loadWarning = loaded?.warning;
    if (!loaded) await saveGame(state);
  } catch (err) {
    console.error(err);
    state = createNewGame(randomSeed());
    loadWarning = 'Não foi possível acessar os saves deste navegador. O progresso pode não ser salvo.';
  }

  const app = new Application();
  await app.init({ resizeTo: window, background: '#1a2a3a', antialias: true });
  document.getElementById('game')!.appendChild(app.canvas);

  const sim = new Sim(state);
  const camera = new Camera(state.camera, app.screen.width, app.screen.height);
  camera.clamp();
  const world = new Container();
  const terrain = new TerrainLayer(state.world, hashString(state.seed), app.renderer);
  const entities = new EntityLayer();
  const overlay = new OverlayLayer();
  const fx = new FxLayer();
  world.addChild(terrain.container, overlay.under, entities.container, fx.g, overlay.over);
  const lighting = new Lighting();
  app.stage.addChild(world, lighting.overlay, overlay.screen);

  const input = new CameraInput(camera, app.canvas);
  input.edgePan = readPref(EDGE_PAN_KEY) !== 'off';
  setSoundEnabled(readPref(SOUND_KEY) !== 'off');
  unlockAudioOnGesture();

  // --- Salvamento ---
  let saving = false;
  const save = async (manual = false) => {
    if (saving) return;
    saving = true;
    try {
      await saveGame(state);
      if (manual) hud.toast('Jogo salvo.');
    } catch (err) {
      console.error(err);
      hud.toast('Falha ao salvar o jogo!');
    } finally {
      saving = false;
    }
  };
  // Troca a partida inteira (nova cidade ou save importado) e recarrega a página.
  const replaceGame = async (next: GameState) => {
    window.removeEventListener('beforeunload', onUnload);
    await clearSaves();
    await saveGame(next);
    location.reload();
  };
  const onUnload = () => void saveGame(state);
  window.addEventListener('beforeunload', onUnload);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void save();
  });
  setInterval(() => void save(), BALANCE.save.autosaveSeconds * 1000);

  // --- Interface ---
  let speedBeforePause = state.speed || 1;
  const setSpeed = (s: number) => {
    if (s === 0 && state.speed !== 0) speedBeforePause = state.speed;
    state.speed = s;
  };
  const togglePause = () => setSpeed(state.speed === 0 ? speedBeforePause : 0);

  const ui = document.getElementById('ui')!;
  const hud = new Hud({ setSpeed, openMenu: () => openMenu(), selectIdle: () => selection.selectNextIdle() });
  const selection = new SelectionController(sim, camera, app.canvas, (t) => hud.toast(t));
  const bottom = new BottomPanel(sim, selection, (t) => hud.toast(t));
  const minimap = new Minimap(state, camera);
  let speedBeforeMenu = state.speed;
  const menu = new Menu({
    saveNow: () => void save(true),
    exportSave: () => exportSave(state),
    importSave: async () => {
      try {
        await replaceGame(await importSaveFile());
      } catch (err) {
        hud.toast(`Não foi possível importar: ${(err as Error).message}`);
      }
    },
    newCity: () => void replaceGame(createNewGame(randomSeed())),
    setEdgePan: (on) => {
      input.edgePan = on;
      writePref(EDGE_PAN_KEY, on ? 'on' : 'off');
    },
    getEdgePan: () => input.edgePan,
    setSound: (on) => {
      setSoundEnabled(on);
      writePref(SOUND_KEY, on ? 'on' : 'off');
    },
    getSound: () => soundEnabled(),
    getInfo: () => {
      const c = getClock(state.tick);
      return `Dia ${c.day} desde a fundação · ${c.season}, ano ${c.year} · seed ${state.seed}`;
    },
    onClose: () => setSpeed(speedBeforeMenu),
  });
  const openMenu = () => {
    speedBeforeMenu = state.speed;
    setSpeed(0);
    menu.open();
  };

  const debug = new DebugPanel(state, {
    setSpeed,
    skipTicks: (n) => {
      for (let i = 0; i < n; i++) step(sim);
    },
    spawnTitan: () => {
      const day = getClock(state.tick).day;
      spawnTitanNear(sim, Math.min(7, 3 + day * 0.3 + Math.random() * 2), 24);
    },
  });
  // Tela de derrota: o Centro da Vila caiu.
  const gameOver = document.createElement('div');
  gameOver.className = 'modal-backdrop hidden';
  let isGameOver = false;
  const showGameOver = () => {
    isGameOver = true;
    setSpeed(0);
    const c = getClock(state.tick);
    gameOver.innerHTML = '';
    const modal = document.createElement('div');
    modal.className = 'modal panel gameover';
    const h = document.createElement('h2');
    h.textContent = 'A CIDADE CAIU';
    const p = document.createElement('div');
    p.className = 'row';
    p.textContent = `O Centro da Vila foi destruído no dia ${c.day}. Os sobreviventes se dispersam...`;
    const btn = document.createElement('button');
    btn.textContent = 'Fundar uma nova cidade';
    btn.onclick = () => void replaceGame(createNewGame(randomSeed()));
    modal.append(h, p, btn);
    gameOver.appendChild(modal);
    gameOver.classList.remove('hidden');
  };

  ui.append(hud.topbar, hud.paused, minimap.el, bottom.el, hud.log, hud.toasts, debug.el, menu.el, gameOver);
  if (loadWarning) hud.toast(loadWarning);

  // Avisos da simulação: notificação clicável (leva a câmera ao local) e som, sem repetir demais.
  const lastAlert: Partial<Record<Alert['kind'], number>> = {};
  const throttle: Record<Alert['kind'], number> = { sighted: 6000, underAttack: 15000, greatAttack: 0, death: 2500, destroyed: 4000 };
  const handleAlert = (a: Alert) => {
    const now = performance.now();
    if (now - (lastAlert[a.kind] ?? -Infinity) < throttle[a.kind]) return;
    lastAlert[a.kind] = now;
    const goTo = () => camera.centerOn(a.x, a.y);
    switch (a.kind) {
      case 'sighted':
      case 'underAttack':
        hud.toast(a.text, goTo, true);
        bell(a.kind === 'underAttack' ? 3 : 2);
        break;
      case 'greatAttack':
        hud.toast(a.text, goTo, true);
        horn();
        break;
      case 'death':
      case 'destroyed':
        hud.toast(a.text, goTo, true);
        thud();
        break;
    }
  };

  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (menu.isOpen) menu.close();
      else if (!selection.handleKey(e)) openMenu();
      return;
    }
    if (menu.isOpen || isGameOver) return;
    if (selection.handleKey(e)) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePause();
        break;
      case 'F3':
        e.preventDefault();
        debug.toggle();
        break;
      case 'Equal':
      case 'NumpadAdd': {
        const i = BALANCE.speeds.indexOf(state.speed as 0 | 1 | 2 | 3);
        setSpeed(BALANCE.speeds[Math.min(BALANCE.speeds.length - 1, i + 1)]);
        break;
      }
      case 'Minus':
      case 'NumpadSubtract': {
        const i = BALANCE.speeds.indexOf(state.speed as 0 | 1 | 2 | 3);
        setSpeed(BALANCE.speeds[Math.max(0, i - 1)]);
        break;
      }
    }
  });

  // --- Laço principal ---
  const loop = new FixedLoop(() => step(sim));
  let hudTimer = 0;
  app.ticker.add((ticker) => {
    const dtMs = ticker.deltaMS;
    loop.advance(dtMs, state.speed);

    camera.screenW = app.screen.width;
    camera.screenH = app.screen.height;
    if (!menu.isOpen) input.update(dtMs / 1000);
    world.scale.set(camera.zoom);
    world.position.set(
      Math.round(camera.screenW / 2 - camera.state.x * camera.zoom),
      Math.round(camera.screenH / 2 - camera.state.y * camera.zoom),
    );

    if (sim.terrainChanges.length) {
      terrain.markDirty(sim.terrainChanges);
      minimap.markDirty();
      sim.terrainChanges = [];
    }
    terrain.update(camera.viewRect());
    entities.sync(sim, performance.now() / 1000);
    if (sim.fx.length) {
      fx.add(sim.fx);
      sim.fx = [];
    }
    fx.update(dtMs / 1000);
    if (sim.alerts.length) {
      for (const a of sim.alerts) handleAlert(a);
      sim.alerts = [];
    }
    overlay.update(sim, selection, camera.zoom);
    lighting.update(getClock(state.tick).dayFraction, camera.screenW, camera.screenH);

    if (selection.consumeChanged()) bottom.update();
    hudTimer += dtMs;
    if (hudTimer > 200) {
      hudTimer = 0;
      hud.update(state);
      hud.setPaused(state.speed === 0 && !menu.isOpen && !isGameOver);
      selection.prune();
      bottom.update();
      if (!isGameOver && !state.buildings.some((b) => b.kind === 'townCenter')) showGameOver();
    }
    minimap.draw();
    debug.update();
  });
  hud.update(state);

  // Acesso para testes automatizados (abrir o jogo com ?debug na URL).
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as Record<string, unknown>).mauern = { sim, camera, selection };
  }
}

void boot();

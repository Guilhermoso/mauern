import { Application, Container } from 'pixi.js';
import './ui/style.css';
import { BALANCE } from './data/balance';
import { hashString, randomSeed } from './core/rng';
import { FixedLoop } from './core/loop';
import { step } from './core/simulation';
import { getClock } from './core/time';
import { createNewGame, type GameState } from './state';
import { clearSaves, exportSave, importSaveFile, loadLatest, saveGame } from './save/storage';
import { Camera } from './render/camera';
import { TerrainLayer } from './render/terrainLayer';
import { EntityLayer } from './render/entityLayer';
import { Lighting } from './render/lighting';
import { CameraInput, isTyping } from './input/cameraInput';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Menu } from './ui/menu';
import { DebugPanel } from './ui/debug';

const EDGE_PAN_KEY = 'mauern.edgePan';

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

  const camera = new Camera(state.camera, app.screen.width, app.screen.height);
  camera.clamp();
  const world = new Container();
  const terrain = new TerrainLayer(state.world, hashString(state.seed), app.renderer);
  const entities = new EntityLayer();
  world.addChild(terrain.container, entities.container);
  const lighting = new Lighting();
  app.stage.addChild(world, lighting.overlay);

  const input = new CameraInput(camera, app.canvas);
  try {
    input.edgePan = localStorage.getItem(EDGE_PAN_KEY) !== 'off';
  } catch {
    /* armazenamento indisponível: mantém o padrão */
  }

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
  const hud = new Hud({ setSpeed, openMenu: () => openMenu() });
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
      try {
        localStorage.setItem(EDGE_PAN_KEY, on ? 'on' : 'off');
      } catch {
        /* ignora */
      }
    },
    getEdgePan: () => input.edgePan,
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
      for (let i = 0; i < n; i++) step(state);
    },
  });
  ui.append(hud.topbar, minimap.el, hud.log, hud.toasts, debug.el, menu.el);
  if (loadWarning) hud.toast(loadWarning);

  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (menu.isOpen) menu.close();
      else openMenu();
      return;
    }
    if (menu.isOpen) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePause();
        break;
      case 'F3':
        e.preventDefault();
        debug.toggle();
        break;
      case 'KeyH': {
        const tc = state.buildings.find((b) => b.kind === 'townCenter');
        if (tc) camera.centerOn((tc.tx + 2) * BALANCE.world.tileSize, (tc.ty + 2) * BALANCE.world.tileSize);
        break;
      }
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
  const loop = new FixedLoop(() => step(state));
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

    terrain.update(camera.viewRect());
    entities.sync(state, performance.now() / 1000);
    lighting.update(getClock(state.tick).dayFraction, camera.screenW, camera.screenH);

    hudTimer += dtMs;
    if (hudTimer > 200) {
      hudTimer = 0;
      hud.update(state);
    }
    minimap.draw();
    debug.update();
  });
  hud.update(state);
}

void boot();

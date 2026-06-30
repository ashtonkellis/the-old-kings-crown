import { GameStore } from './engine/store';
import { GameState, PlayerId, Faction } from './engine/types';
import { runBotTurn } from './ai/bot';
import { renderAll } from './ui/render';
import { createUIState, buildActionPanel, initClickHandlers, UIState } from './ui/input';

// ── Game config ────────────────────────────────────────────────────────────────

const FACTIONS: Faction[] = ['nobility', 'clans'];

const store = new GameStore({
  playerCount: 2,
  factions: FACTIONS,
  gameLength: 'standard',
});

// ── UI state (selection, supporter queue) ──────────────────────────────────────

const ui: UIState = createUIState();

// ── Overlay elements ───────────────────────────────────────────────────────────

function ensureOverlay(): void {
  if (!document.getElementById('instruction-bar')) {
    const bar = document.createElement('div');
    bar.id = 'instruction-bar';
    document.body.appendChild(bar);

    const text = document.createElement('div');
    text.id = 'instruction-text';
    bar.appendChild(text);
  }

  if (!document.getElementById('action-panel')) {
    const panel = document.createElement('div');
    panel.id = 'action-panel';
    document.body.appendChild(panel);
  }
}

// ── Render cycle ───────────────────────────────────────────────────────────────

function refresh(): void {
  const state = store.getState();
  renderAll(state, ui);
  buildActionPanel(store, ui, refresh);
}

// ── Bot runner ─────────────────────────────────────────────────────────────────

let botRunning = false;

async function maybeTriggerBot(state: GameState): Promise<void> {
  if (state.gameOver || state.activePlayerId === 1 || botRunning) return;

  const botId = state.activePlayerId as PlayerId;
  if (!botId) return;

  botRunning = true;
  try {
    await runBotTurn(state, botId, (action) => {
      store.dispatch(action);
    });
  } finally {
    botRunning = false;
  }
}

// ── Wire up ────────────────────────────────────────────────────────────────────

store.subscribe((state) => {
  // Clear selection on phase/step transitions — stale selection would be confusing
  ui.selectedCardUid = null;
  ui.pendingActionType = null;
  ui.phase = (state.board.step === 'bid' && state.players.find(p => p.playerId === 1)?.bid)
    ? 'bid-resolve'
    : 'other';

  refresh();
  maybeTriggerBot(state);
});

initClickHandlers(store, ui, refresh);

// Expose for DevTools debugging
(window as any).tokcStore = store;
(window as any).tokcDispatch = (a: unknown) => store.dispatch(a as never);
(window as any).tokcState = () => store.getState();

// ── Bootstrap ──────────────────────────────────────────────────────────────────

function boot(): void {
  document.body.dataset.players = String(store.getState().playerCount);
  ensureOverlay();
  refresh();
}

// Modules are deferred — DOMContentLoaded may have already fired. Handle both.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

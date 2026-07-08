import { GameStore } from './engine/store';
import { GameState, PlayerId, Faction } from './engine/types';
import { runBotTurn } from './ai/bot';
import { renderAll } from './ui/render';
import { createUIState, buildActionPanel, initClickHandlers, UIState } from './ui/input';
import { buildRecord, appendRecord, PlayerType } from './analytics/log';
import { initStatsButton } from './analytics/ui';

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

// ── Game bootstrap ─────────────────────────────────────────────────────────────

function startGame(botCount: 1 | 2 | 3): void {
  const playerCount = (botCount + 1) as 2 | 3 | 4;
  const allFactions: Faction[] = ['nobility', 'clans', 'uprising', 'gathering'];
  const factions = allFactions.slice(0, playerCount);

  const PLAYER_TYPES: Record<PlayerId, PlayerType> = { 1: 'human', 2: 'bot', 3: 'bot', 4: 'bot' };
  const BOT_VERSIONS: Partial<Record<PlayerId, string>> = {};
  for (let i = 2; i <= playerCount; i++) {
    BOT_VERSIONS[i as PlayerId] = 'rule-based-v1';
  }

  const store = new GameStore({ playerCount, factions, gameLength: 'standard' });
  const ui: UIState = createUIState();
  let botRunning = false;
  let gameRecorded = false;

  function refresh(): void {
    const state = store.getState();
    renderAll(state, ui);
    buildActionPanel(store, ui, refresh);
  }

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

  store.subscribe((state) => {
    ui.selectedCardUid = null;
    ui.pendingActionType = null;
    ui.phase = (state.board.step === 'bid' && state.players.find(p => p.playerId === 1)?.bid)
      ? 'bid-resolve'
      : 'other';

    if (state.gameOver && !gameRecorded) {
      gameRecorded = true;
      appendRecord(buildRecord(state, PLAYER_TYPES, BOT_VERSIONS));
    }

    refresh();
    maybeTriggerBot(state);
  });

  initClickHandlers(store, ui, refresh);

  (window as any).tokcStore = store;
  (window as any).tokcDispatch = (a: unknown) => store.dispatch(a as never);
  (window as any).tokcState = () => store.getState();

  document.getElementById('lobby')!.classList.add('hidden');
  document.body.dataset.players = String(playerCount);
  ensureOverlay();
  initStatsButton();
  refresh();
}

// ── Lobby wiring ───────────────────────────────────────────────────────────────

function initLobby(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-bot-count]').forEach(btn => {
    btn.addEventListener('click', () => {
      const count = parseInt(btn.dataset.botCount ?? '1') as 1 | 2 | 3;
      startGame(count);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLobby);
} else {
  initLobby();
}

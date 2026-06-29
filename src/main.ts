import { GameStore } from './engine/store';
import { GameState, PlayerId, Faction } from './engine/types';
import { getValidActions } from './engine/rules';
import { runBotTurn } from './ai/bot';

// ─── Game configuration ────────────────────────────────────────────────────────

const FACTIONS: Faction[] = ['nobility', 'clans', 'uprising', 'gathering'];

const store = new GameStore({
  playerCount: 2,
  factions: FACTIONS.slice(0, 2),
  gameLength: 'standard',
});

// ─── DOM helpers ───────────────────────────────────────────────────────────────

function qs<T extends Element>(sel: string): T | null {
  return document.querySelector<T>(sel);
}

function setText(sel: string, text: string): void {
  const el = qs(sel);
  if (el) el.textContent = text;
}

// ─── Render ────────────────────────────────────────────────────────────────────

function render(state: GameState): void {
  // Phase / step indicator
  setText('#phase-indicator', `Round ${state.board.round} — ${state.board.phase} / ${state.board.step}`);

  // Active player
  const activeId = state.activePlayerId;
  setText('#active-player', activeId ? `Player ${activeId}'s turn` : '—');

  // Per-player info
  for (const player of state.players) {
    const pid = player.playerId;
    const prefix = `#player-${pid}`;
    setText(`${prefix}-influence`, `Influence: ${player.supply.influence}`);
    setText(`${prefix}-lore`, `Lore: ${player.supply.lore}`);
    setText(`${prefix}-hand`, `Hand: ${player.hand.length} cards`);
    setText(`${prefix}-deck`, `Deck: ${player.deck.length}`);
  }

  // Kingdom Road
  const roadEl = qs('#great-road');
  if (roadEl) {
    roadEl.innerHTML = '';
    state.board.greatRoad.forEach((kc, i) => {
      const slot = document.createElement('div');
      slot.className = 'road-slot';
      slot.textContent = kc ? kc.defId.replace('kc-', '') : `[empty ${i}]`;
      roadEl.appendChild(slot);
    });
  }

  // Game over banner
  if (state.gameOver) {
    setText('#status-banner', state.winner
      ? `Game over — Player ${state.winner} wins!`
      : 'Game over — Tie!');
  }

  // Valid actions for the active human player (player 1)
  renderActions(state);
}

function renderActions(state: GameState): void {
  const actionsEl = qs('#action-list');
  if (!actionsEl) return;
  actionsEl.innerHTML = '';

  const humanId: PlayerId = 1;
  if (state.activePlayerId !== humanId) {
    actionsEl.textContent = 'Waiting for bot…';
    return;
  }

  const actions = getValidActions(state, humanId);
  for (const action of actions.slice(0, 8)) { // show first 8 to avoid overflow
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = JSON.stringify(action).slice(0, 80);
    btn.addEventListener('click', () => store.dispatch(action));
    actionsEl.appendChild(btn);
  }
}

// ─── Bot runner ────────────────────────────────────────────────────────────────

async function maybeTriggerBot(state: GameState): Promise<void> {
  const humanId: PlayerId = 1;
  if (state.gameOver) return;
  if (state.activePlayerId === humanId) return;

  const botId = state.activePlayerId;
  if (!botId) return;

  await runBotTurn(state, botId, action => store.dispatch(action));
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

store.subscribe(state => {
  render(state);
  maybeTriggerBot(state);
});

// Initial render
render(store.getState());

// Inject minimal UI elements if they don't exist in index.html yet
function ensureUI(): void {
  if (!qs('#phase-indicator')) {
    const el = document.createElement('div');
    el.id = 'phase-indicator';
    el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#c9a84c;padding:4px 12px;border-radius:4px;font-family:Cinzel,serif;z-index:100;';
    document.body.appendChild(el);
  }
  if (!qs('#action-list')) {
    const el = document.createElement('div');
    el.id = 'action-list';
    el.style.cssText = 'position:fixed;bottom:8px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#eee;padding:8px;border-radius:4px;max-width:600px;z-index:100;display:flex;flex-wrap:wrap;gap:4px;';
    document.body.appendChild(el);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureUI();
  render(store.getState());
});

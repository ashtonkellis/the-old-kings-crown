import { GameState, CardInstance, CardDef, PlayerId, Region, Location } from '../engine/types';
import { getCardDef } from '../engine/data/factions';
import { getKingdomCardDef } from '../engine/data/kingdoms';
import type { UIState } from './input';

const SUIT_ICON: Record<string, string> = { coins: '🪙', scroll: '📜', sword: '⚔' };
const REGIONS: Region[] = ['highlands', 'plateau', 'lowlands'];

function qs<T extends Element = Element>(sel: string): T | null {
  return document.querySelector<T>(sel);
}
function qsa<T extends Element = Element>(sel: string): NodeListOf<T> {
  return document.querySelectorAll<T>(sel);
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtCmd(c: { type: string; value?: number }): string {
  const name = c.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return c.value !== undefined ? `${name} (${c.value})` : name;
}

// ── Card element factory ───────────────────────────────────────────────────────

function makeCardEl(card: CardInstance): HTMLElement {
  const def = getCardDef(card.defId);
  const el = document.createElement('div');
  el.className = `card card-front${def.isHeir ? ' heir-card' : ''}`;
  el.dataset.cardUid = card.uid;
  el.title = `${def.title} — Str ${def.strength}${def.traits.length ? ' · ' + def.traits.join(', ') : ''}`;

  const traits = def.traits.map(t => `<div class="card-trait trait-${t}">${cap(t)}</div>`).join('');
  const cmds = def.commands.map(c => `<div class="card-command">${fmtCmd(c)}</div>`).join('');
  const lore = def.loreIcons > 0 ? `<div class="card-lore">♦×${def.loreIcons}</div>` : '';
  const vote = def.voteIcons > 0 ? `<div class="card-vote">🗳×${def.voteIcons}</div>` : '';

  el.innerHTML = `
    <div class="card-strength">${def.strength}</div>
    <div class="card-name">${def.title}</div>
    ${traits}${cmds}${lore}${vote}
  `;
  return el;
}

// ── Header ─────────────────────────────────────────────────────────────────────

function renderHeader(state: GameState): void {
  const roundEl = qs('#round-value');
  const phaseEl = qs('#phase-value');
  const turnEl  = qs('#turn-value');

  if (roundEl) roundEl.textContent = `${state.board.round} / ${state.board.maxRounds}`;
  if (phaseEl) phaseEl.textContent = cap(state.board.phase);
  if (turnEl) {
    const active = state.players.find(p => p.playerId === state.activePlayerId);
    turnEl.textContent = active ? `The ${cap(active.faction)}` : '—';
  }
}

// ── P1 Hand ────────────────────────────────────────────────────────────────────

function renderP1Hand(state: GameState, ui: UIState): void {
  const p1 = state.players.find(p => p.playerId === 1);
  if (!p1) return;

  const handEl = qs('[data-zone="hand"][data-player="1"] .hand-cards');
  const labelEl = qs('[data-zone="hand"][data-player="1"] .zone-label');
  if (!handEl) return;

  handEl.innerHTML = '';
  if (labelEl) labelEl.textContent = `Hand (${p1.hand.length})`;

  for (const card of p1.hand) {
    const el = makeCardEl(card);
    if (ui.selectedCardUid === card.uid) el.classList.add('selected-card');
    handEl.appendChild(el);
  }

  // Show bid card as a placeholder if pending resolution
  if (p1.bid && !p1.bidResolved) {
    const def = getCardDef(p1.bid.defId);
    const bidEl = document.createElement('div');
    bidEl.className = 'card card-bid-pending';
    bidEl.innerHTML = `<div class="card-strength">${def.strength}</div><div class="card-name">${def.title}</div><div class="card-command">Bid placed →</div>`;
    handEl.appendChild(bidEl);
  }
}

// ── Great Road ─────────────────────────────────────────────────────────────────

function renderGreatRoad(state: GameState, ui: UIState): void {
  const slots = qsa('[data-zone="great-road-slot"]');
  slots.forEach(slotEl => {
    const el = slotEl as HTMLElement;
    const slotNum = parseInt(el.dataset.slot ?? '1');
    const roadIdx = slotNum - 1;          // HTML is 1-indexed
    const kc = state.board.greatRoad[roadIdx];
    const cardEl = el.querySelector('[data-zone="kingdom-card-road"]');
    if (!cardEl) return;

    if (kc) {
      const def = getKingdomCardDef(kc.defId);
      cardEl.innerHTML = `
        <div class="kc-suit">${SUIT_ICON[def.suit]}</div>
        <div class="kc-title">${def.title}</div>
        <div class="kc-rules">${def.rulesText}</div>
      `;
      cardEl.classList.remove('empty');
      el.dataset.roadSlot = String(roadIdx);
      el.dataset.kcDefId = kc.defId;
    } else {
      cardEl.innerHTML = '<span class="empty-hint">—</span>';
      cardEl.classList.add('empty');
      delete el.dataset.roadSlot;
      delete el.dataset.kcDefId;
    }

    // Highlight during bid resolution
    if (ui.phase === 'bid-resolve' && kc) {
      slotEl.classList.add('valid-action');
    }
  });
}

// ── KC Slots ───────────────────────────────────────────────────────────────────

function renderKCSlots(state: GameState): void {
  for (const player of state.players) {
    player.kcSlots.forEach((slot, idx) => {
      const slotEl = qs(
        `[data-zone="kc-slot"][data-player="${player.playerId}"][data-slot="${idx + 1}"]`
      );
      if (!slotEl) return;

      const kcEl = slotEl.querySelector('[data-zone="kingdom-card"]');
      const occEl = slotEl.querySelector('[data-zone="occupying-card"]');

      if (kcEl) {
        if (slot.kc) {
          const def = getKingdomCardDef(slot.kc.defId);
          kcEl.innerHTML = `<div class="kc-suit-sm">${SUIT_ICON[def.suit]}</div><div class="kc-title-sm">${def.title}</div>`;
          kcEl.classList.remove('empty');
        } else {
          kcEl.innerHTML = '<span class="empty-hint">Kingdom Card</span>';
          kcEl.classList.add('empty');
        }
      }

      if (occEl) {
        if (slot.occupyingCard) {
          const def = getCardDef(slot.occupyingCard.defId);
          occEl.innerHTML = `<div class="occ-str">${def.strength}</div><div class="occ-name">${def.title}</div>`;
          occEl.classList.remove('empty');
        } else {
          occEl.innerHTML = '<span class="empty-hint">Occupying</span>';
          occEl.classList.add('empty');
        }
      }
    });
  }
}

// ── Bid Area ───────────────────────────────────────────────────────────────────

function renderBidArea(state: GameState): void {
  for (const player of state.players) {
    const bidCardEl = qs<HTMLElement>(`[data-zone="bid-slot"][data-player="${player.playerId}"] .card`);
    if (!bidCardEl) continue;

    if (player.bid) {
      if (player.playerId === 1) {
        const def = getCardDef(player.bid.defId);
        bidCardEl.textContent = `${def.strength} — ${def.title}`;
      } else {
        bidCardEl.textContent = `P${player.playerId} bid`;
      }
      bidCardEl.classList.add('has-bid');
    } else {
      bidCardEl.textContent = `P${player.playerId} Bid`;
      bidCardEl.classList.remove('has-bid');
    }
  }
}

// ── Resources / Counts ─────────────────────────────────────────────────────────

function renderResources(state: GameState): void {
  for (const player of state.players) {
    const pid = player.playerId;
    const inf = document.getElementById(`p${pid}-influence`);
    const lor = document.getElementById(`p${pid}-lore`);
    if (inf) inf.textContent = String(player.supply.influence);
    if (lor) lor.textContent = String(player.supply.lore);

    // Deck / discard counts for P1 (the full board shows these)
    const deckCount = qs<HTMLElement>(`[data-zone="deck"][data-player="${pid}"] .zone-count`);
    const discCount = qs<HTMLElement>(`[data-zone="discard"][data-player="${pid}"] .zone-count`);
    if (deckCount) deckCount.textContent = String(player.deck.length);
    if (discCount) discCount.textContent = String(player.discardPile.length);

    // Side boards use inline counts
    const deckInline = qs<HTMLElement>(`[data-zone="deck"][data-player="${pid}"] .zone-count-inline`);
    const discInline = qs<HTMLElement>(`[data-zone="discard"][data-player="${pid}"] .zone-count-inline`);
    if (deckInline) deckInline.textContent = String(player.deck.length);
    if (discInline) discInline.textContent = String(player.discardPile.length);
  }
}

// ── Region Cards ───────────────────────────────────────────────────────────────

function renderRegionCards(state: GameState): void {
  // Mark region card slots as filled when a player has placed there
  for (const region of REGIONS) {
    const regionState = state.board.map[region];
    for (const ac of regionState.activeCards) {
      const slotEl = qs<HTMLElement>(
        `[data-zone="region-card-slot"][data-player="${ac.playerId}"][data-region="${region}"]`
      );
      if (!slotEl) continue;

      if (ac.faceDown) {
        slotEl.innerHTML = '<div class="card card-back placed-region-card"></div>';
      } else {
        const def = getCardDef(ac.card.defId);
        slotEl.innerHTML = `<div class="card card-front placed-region-card"><div class="card-strength">${def.strength}</div><div class="card-name">${def.title}</div></div>`;
      }
    }
  }
}

// ── Supporter Counts ───────────────────────────────────────────────────────────

function renderSupporters(state: GameState, pendingPlacements: { region: Region; count: number }[]): void {
  for (const region of REGIONS) {
    const regionState = state.board.map[region];
    const suppEl = qs<HTMLElement>(`[data-region="${region}"] .region-supporters-count`);
    if (suppEl) {
      const lines = regionState.supporters.map(s => {
        const faction = state.players.find(p => p.playerId === s.playerId)?.faction ?? '';
        return `<span class="supp-${faction}">${cap(faction)}: ${s.count}</span>`;
      });
      suppEl.innerHTML = lines.join(' ');
    }

    // Show pending placements
    const pendEl = qs(`[data-region="${region}"] .pending-sup-count`);
    if (pendEl) {
      const pend = pendingPlacements.find(p => p.region === region);
      pendEl.textContent = pend && pend.count > 0 ? `(+${pend.count})` : '';
    }
  }
}

// ── Highlights ─────────────────────────────────────────────────────────────────

export function clearHighlights(): void {
  qsa('.valid-action, .invalid-action, .selected-card').forEach(el => {
    el.classList.remove('valid-action', 'invalid-action', 'selected-card');
  });
}

function applyHighlights(state: GameState, ui: UIState): void {
  clearHighlights();
  if (state.activePlayerId !== 1 || state.gameOver) return;

  const { phase, step } = state.board;
  const p1 = state.players.find(p => p.playerId === 1)!;

  if (phase === 'spring') {
    if (step === 'bid' && !p1.bid) {
      // Highlight hand cards to bid
      qsa('[data-zone="hand"][data-player="1"] [data-card-uid]').forEach(el =>
        el.classList.add('valid-action')
      );
    }

    if (step === 'bid' && p1.bid && !p1.bidResolved) {
      // Highlight Great Road slots with KCs
      qsa('[data-zone="great-road-slot"]').forEach(el => {
        if ((el as HTMLElement).dataset.kcDefId) el.classList.add('valid-action');
      });
      // Highlight opponent KC slots (steal option)
      for (const other of state.players) {
        if (other.playerId === 1) continue;
        other.kcSlots.forEach((slot, idx) => {
          if (slot.kc) {
            qs(`[data-zone="kc-slot"][data-player="${other.playerId}"][data-slot="${idx + 1}"]`)
              ?.classList.add('valid-action');
          }
        });
      }
    }

    if (step === 'herald' && p1.herald.location === 'player-board') {
      qsa('[data-zone="herald-slot"]').forEach(el => el.classList.add('valid-action'));
    }

    if (step === 'deploy-cards') {
      if (!ui.selectedCardUid) {
        qsa('[data-zone="hand"][data-player="1"] [data-card-uid]').forEach(el =>
          el.classList.add('valid-action')
        );
      } else {
        qs(`[data-card-uid="${ui.selectedCardUid}"]`)?.classList.add('selected-card');
        qsa('[data-zone="region-card-slot"][data-player="1"]').forEach(el =>
          el.classList.add('valid-action')
        );
      }
    }

    if (step === 'deploy-supporters') {
      qsa('[data-zone="region-supporters"]').forEach(el => el.classList.add('valid-action'));
    }
  }

  if (phase === 'summer' && step === 'claim-rewards') {
    const region = state.board.clashOrder?.[state.board.currentClashIndex];
    if (region) {
      qsa(`[data-zone="location"][data-region="${region}"]`).forEach(el =>
        el.classList.add('valid-action')
      );
    }
  }

  if (phase === 'autumn' && step === 'autumn-actions') {
    if (!ui.selectedCardUid) {
      qsa('[data-zone="hand"][data-player="1"] [data-card-uid]').forEach(el =>
        el.classList.add('valid-action')
      );
    } else {
      qs(`[data-card-uid="${ui.selectedCardUid}"]`)?.classList.add('selected-card');
      if (ui.pendingActionType === 'govern') {
        qsa('[data-zone="council-cards"]').forEach(el => el.classList.add('valid-action'));
      }
    }
  }
}

// ── Instruction text ───────────────────────────────────────────────────────────

function renderInstruction(state: GameState, ui: UIState): void {
  const el = document.getElementById('instruction-text');
  if (!el) return;

  if (state.gameOver) {
    el.textContent = state.winner
      ? `Game over — Player ${state.winner} wins!`
      : 'Game over — It\'s a tie!';
    return;
  }

  if (state.activePlayerId !== 1) {
    const active = state.players.find(p => p.playerId === state.activePlayerId);
    el.textContent = `Waiting for ${active ? cap(active.faction) : 'opponent'}…`;
    return;
  }

  const { phase, step } = state.board;
  const p1 = state.players.find(p => p.playerId === 1)!;

  const msg: Record<string, string> = {
    'spring/bid/no-bid':      'Spring Bid — click a hand card to bid it for a Kingdom Card.',
    'spring/bid/bid-placed':  'Bid placed — click a Great Road slot to claim that KC, or an opponent\'s KC slot to steal it.',
    'spring/herald':          'Spring Herald — click a Location on the board to place your Herald there.',
    'spring/herald/done':     'Herald placed. Click Confirm.',
    'spring/deploy-cards/pick': 'Spring Cards — click a hand card to select it, then click a Region slot to place it there.',
    'spring/deploy-cards/sel':  'Card selected — click a Region slot (the dashed box next to a Region) to place it.',
    'spring/deploy-supporters': 'Spring Supporters — click a Region to queue a Supporter there, then click Confirm.',
    'summer/clash-order':     'Summer — as last player, choose the order Clashes resolve.',
    'summer/day-action':      'Summer Day — use a Command (Ambush/Retreat/Flank) on an active card, or Pass.',
    'summer/claim-rewards':   'You won the Clash! Click a Location to claim its reward.',
    'autumn/autumn-actions':  'Autumn — click a hand card to Govern it into a Council or Journey it for Lore, then Pass.',
    'autumn/govern-pick':     'Govern — click a Council to place the selected card.',
    'winter':                 'Winter cleanup in progress…',
  };

  let key = `${phase}/${step}`;
  if (phase === 'spring' && step === 'bid') {
    key = p1.bid ? 'spring/bid/bid-placed' : 'spring/bid/no-bid';
  } else if (phase === 'spring' && step === 'deploy-cards') {
    key = ui.selectedCardUid ? 'spring/deploy-cards/sel' : 'spring/deploy-cards/pick';
  } else if (phase === 'spring' && step === 'herald') {
    key = p1.herald.location !== 'player-board' ? 'spring/herald/done' : 'spring/herald';
  } else if (phase === 'autumn' && step === 'autumn-actions') {
    key = ui.pendingActionType === 'govern' && ui.selectedCardUid ? 'autumn/govern-pick' : 'autumn/autumn-actions';
  } else if (phase === 'winter') {
    key = 'winter';
  }

  el.textContent = msg[key] ?? `${cap(phase)} — ${step}`;
}

// ── Master render ──────────────────────────────────────────────────────────────

export function renderAll(state: GameState, ui: UIState): void {
  renderHeader(state);
  renderP1Hand(state, ui);
  renderGreatRoad(state, ui);
  renderKCSlots(state);
  renderBidArea(state);
  renderResources(state);
  renderRegionCards(state);
  renderSupporters(state, ui.supporterQueue);
  applyHighlights(state, ui);
  renderInstruction(state, ui);
}

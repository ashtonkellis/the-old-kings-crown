import { PlayerId, Region, Location, Council } from '../engine/types';
import { GameStore } from '../engine/store';
import { getValidActions } from '../engine/rules';
import { getCardDef } from '../engine/data/factions';

// ── UI state ───────────────────────────────────────────────────────────────────

export interface UIState {
  selectedCardUid: string | null;
  pendingActionType: 'region-card' | 'govern' | null;
  supporterQueue: { region: Region; count: number }[];
  // used only by render.ts to decide which slots to highlight for bid resolution
  phase: 'bid-resolve' | 'other';
}

export function createUIState(): UIState {
  return {
    selectedCardUid: null,
    pendingActionType: null,
    supporterQueue: [],
    phase: 'other',
  };
}

function resetSelection(ui: UIState): void {
  ui.selectedCardUid = null;
  ui.pendingActionType = null;
}

// ── Action panel ───────────────────────────────────────────────────────────────

export function buildActionPanel(
  store: GameStore,
  ui: UIState,
  onChange: () => void
): void {
  let panelEl = document.getElementById('action-panel');
  if (!panelEl) return;
  panelEl.innerHTML = '';

  const state = store.getState();
  if (state.gameOver || state.activePlayerId !== 1) return;

  const { phase, step } = state.board;
  const p1 = state.players.find(p => p.playerId === 1)!;
  const valid = getValidActions(state, 1);

  // ── Pass / End Turn ────────────────────────────────────────────────────────
  if (valid.some(a => a.type === 'PASS_ACTION')) {
    const label = phase === 'spring' && step === 'deploy-supporters'
      ? 'Done placing Supporters'
      : phase === 'spring' && step === 'deploy-cards'
      ? 'Done placing Cards'
      : phase === 'spring' && step === 'herald'
      ? 'Confirm Herald Placement'
      : 'Pass';
    btn(panelEl, label, () => {
      store.dispatch({ type: 'PASS_ACTION', playerId: 1 });
    }, 'btn-pass');
  }
  if (valid.some(a => a.type === 'END_TURN')) {
    btn(panelEl, 'End Turn', () => {
      store.dispatch({ type: 'END_TURN', playerId: 1 });
    }, 'btn-pass');
  }

  // ── Return bid ─────────────────────────────────────────────────────────────
  if (phase === 'spring' && step === 'bid' && p1.bid && !p1.bidResolved) {
    btn(panelEl, 'Return Bid to Hand', () => {
      store.dispatch({ type: 'RESOLVE_BID_RETURN', playerId: 1 });
    }, 'btn-cancel');
  }

  // ── Confirm supporters ─────────────────────────────────────────────────────
  if (phase === 'spring' && step === 'deploy-supporters' && ui.supporterQueue.length > 0) {
    const total = ui.supporterQueue.reduce((s, p) => s + p.count, 0);
    btn(panelEl, `Confirm Supporters (${total} placed)`, () => {
      store.dispatch({ type: 'PLACE_SUPPORTERS', playerId: 1, placements: ui.supporterQueue });
      ui.supporterQueue = [];
      onChange();
    }, 'btn-primary');
    btn(panelEl, 'Clear Queue', () => {
      ui.supporterQueue = [];
      onChange();
    }, 'btn-cancel');
  }

  // ── Cancel selection ───────────────────────────────────────────────────────
  if (ui.selectedCardUid) {
    btn(panelEl, 'Cancel Selection', () => {
      resetSelection(ui);
      onChange();
    }, 'btn-cancel');

    // Journey button when card is selected
    const card = p1.hand.find(c => c.uid === ui.selectedCardUid);
    if (card && phase === 'autumn' && step === 'autumn-actions') {
      const def = getCardDef(card.defId);
      if (def.loreIcons > 0) {
        btn(panelEl, `Journey (gain ${def.loreIcons} Lore)`, () => {
          store.dispatch({ type: 'JOURNEY', playerId: 1, cardUid: ui.selectedCardUid! });
          resetSelection(ui);
          onChange();
        }, 'btn-primary');
      }
    }
  }

  // ── Clash order (Summer) ───────────────────────────────────────────────────
  if (phase === 'summer' && step === 'clash-order') {
    const orders: [Region, Region, Region][] = [
      ['highlands', 'plateau', 'lowlands'],
      ['highlands', 'lowlands', 'plateau'],
      ['plateau', 'highlands', 'lowlands'],
      ['plateau', 'lowlands', 'highlands'],
      ['lowlands', 'highlands', 'plateau'],
      ['lowlands', 'plateau', 'highlands'],
    ];
    for (const order of orders) {
      btn(panelEl, `${order.join(' → ')}`, () => {
        store.dispatch({ type: 'SET_CLASH_ORDER', playerId: 1, order });
      });
    }
  }

  // ── Spend Lore (Autumn) ────────────────────────────────────────────────────
  if (phase === 'autumn') {
    for (const siteCard of p1.siteOfPower) {
      const def = getCardDef(siteCard.defId);
      const cost = def.loreCost ?? 0;
      if (p1.supply.lore >= cost) {
        btn(panelEl, `Acquire "${def.title}" (${cost}♦)`, () => {
          store.dispatch({ type: 'SPEND_LORE', playerId: 1, siteCardUid: siteCard.uid });
        }, 'btn-primary');
      }
    }
  }
}

function btn(
  parent: HTMLElement,
  label: string,
  onClick: () => void,
  cls?: string
): void {
  const el = document.createElement('button');
  el.className = `action-btn${cls ? ' ' + cls : ''}`;
  el.textContent = label;
  el.addEventListener('click', onClick);
  parent.appendChild(el);
}

// ── Click handler ──────────────────────────────────────────────────────────────

export function initClickHandlers(
  store: GameStore,
  ui: UIState,
  onChange: () => void
): void {
  document.body.addEventListener('click', (e) => {
    const state = store.getState();
    if (state.activePlayerId !== 1 || state.gameOver) return;

    const target = e.target as HTMLElement;
    const { phase, step } = state.board;
    const p1 = state.players.find(p => p.playerId === 1)!;

    // ── Hand card ────────────────────────────────────────────────────────────
    const cardEl = target.closest('[data-card-uid][data-player="1"]') as HTMLElement | null;
    if (cardEl?.dataset.cardUid) {
      const uid = cardEl.dataset.cardUid;

      if (phase === 'spring' && step === 'bid' && !p1.bid) {
        store.dispatch({ type: 'PLACE_BID', playerId: 1, cardUid: uid });
        return;
      }

      if (phase === 'spring' && step === 'deploy-cards') {
        ui.selectedCardUid = uid;
        ui.pendingActionType = 'region-card';
        onChange();
        return;
      }

      if (phase === 'autumn' && step === 'autumn-actions') {
        // Toggle selection — same card deselects
        if (ui.selectedCardUid === uid) {
          resetSelection(ui);
        } else {
          ui.selectedCardUid = uid;
          ui.pendingActionType = 'govern';
        }
        onChange();
        return;
      }

      return; // consumed
    }

    // ── Great Road KC slot ───────────────────────────────────────────────────
    const roadSlotEl = target.closest('[data-zone="great-road-slot"]') as HTMLElement | null;
    if (roadSlotEl && phase === 'spring' && step === 'bid' && p1.bid && !p1.bidResolved) {
      const roadSlot = parseInt(roadSlotEl.dataset.roadSlot ?? '-1');
      if (roadSlot >= 0) {
        store.dispatch({ type: 'RESOLVE_BID_TAKE_KC', playerId: 1, roadSlot });
        return;
      }
    }

    // ── Opponent KC slot (steal) ─────────────────────────────────────────────
    const kcSlotEl = target.closest('[data-zone="kc-slot"]') as HTMLElement | null;
    if (kcSlotEl && phase === 'spring' && step === 'bid' && p1.bid && !p1.bidResolved) {
      const targetPid = parseInt(kcSlotEl.dataset.player ?? '0') as PlayerId;
      const slotIdx = (parseInt(kcSlotEl.dataset.slot ?? '0') - 1) as 0 | 1;
      if (targetPid !== 1 && targetPid >= 1 && targetPid <= 4) {
        const targetPlayer = state.players.find(p => p.playerId === targetPid);
        if (targetPlayer?.kcSlots[slotIdx]?.kc) {
          store.dispatch({
            type: 'RESOLVE_BID_STEAL_KC',
            playerId: 1,
            targetPlayerId: targetPid,
            targetSlot: slotIdx,
          });
          return;
        }
      }
    }

    // ── Herald slot ──────────────────────────────────────────────────────────
    const heraldSlotEl = target.closest('[data-zone="herald-slot"]') as HTMLElement | null;
    if (heraldSlotEl && phase === 'spring' && step === 'herald' && p1.herald.location === 'player-board') {
      const location = heraldSlotEl.dataset.location as Location | undefined;
      if (location) {
        store.dispatch({ type: 'PLACE_HERALD', playerId: 1, location });
        return;
      }
    }

    // ── Region card slot (place card) ────────────────────────────────────────
    const regionSlotEl = target.closest(
      '[data-zone="region-card-slot"][data-player="1"]'
    ) as HTMLElement | null;
    if (regionSlotEl && ui.selectedCardUid && ui.pendingActionType === 'region-card') {
      const region = regionSlotEl.dataset.region as Region | undefined;
      if (region) {
        store.dispatch({
          type: 'PLACE_REGION_CARD',
          playerId: 1,
          region,
          cardUid: ui.selectedCardUid,
        });
        resetSelection(ui);
        onChange();
        return;
      }
    }

    // ── Region supporters area (queue a supporter) ───────────────────────────
    const regionSuppEl = target.closest('[data-zone="region-supporters"]') as HTMLElement | null;
    if (regionSuppEl && phase === 'spring' && step === 'deploy-supporters') {
      const region = regionSuppEl.dataset.region as Region | undefined;
      if (region) {
        const available = p1.supporters.filter(s => s.location === 'player-board').length;
        const alreadyQueued = ui.supporterQueue.reduce((s, p) => s + p.count, 0);
        if (alreadyQueued < available) {
          const existing = ui.supporterQueue.find(p => p.region === region);
          if (existing) existing.count++;
          else ui.supporterQueue.push({ region, count: 1 });
          onChange();
        }
        return;
      }
    }

    // ── Council click (govern) ───────────────────────────────────────────────
    const councilEl = target.closest('[data-zone="council-cards"]') as HTMLElement | null;
    if (councilEl && ui.selectedCardUid && ui.pendingActionType === 'govern') {
      const council = councilEl.dataset.council as Council | undefined;
      if (council) {
        store.dispatch({
          type: 'GOVERN',
          playerId: 1,
          cardUid: ui.selectedCardUid,
          council,
        });
        resetSelection(ui);
        onChange();
        return;
      }
    }

    // ── Location click (claim rewards) ───────────────────────────────────────
    const locationEl = target.closest('[data-zone="location"]') as HTMLElement | null;
    if (locationEl && phase === 'summer' && step === 'claim-rewards') {
      const region = locationEl.dataset.region as Region | undefined;
      const chosenLocation = locationEl.dataset.location as Location | undefined;
      if (region && chosenLocation) {
        store.dispatch({ type: 'CLAIM_REWARDS', playerId: 1, region, chosenLocation });
        return;
      }
    }
  });
}

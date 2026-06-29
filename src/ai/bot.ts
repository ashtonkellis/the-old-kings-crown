import { GameState, Action, PlayerId } from '../engine/types';
import { getValidActions } from '../engine/rules';
import { getPlayer } from '../engine/state';
import { getCardDef } from '../engine/data/factions';

// ─── Scoring heuristics ────────────────────────────────────────────────────────

function scoreAction(state: GameState, playerId: PlayerId, action: Action): number {
  const player = getPlayer(state, playerId);

  switch (action.type) {
    case 'PLACE_BID': {
      // Prefer bidding high-strength cards to win more KC slots
      const card = player.hand.find(c => c.uid === action.cardUid);
      if (!card) return 0;
      const def = getCardDef(card.defId);
      return def.strength * 2;
    }

    case 'RESOLVE_BID_TAKE_KC': {
      // Prefer taking KCs we don't have; prefer earlier slots (fresher cards)
      const hasEmptySlot = player.kcSlots.some(s => s.kc === null);
      return hasEmptySlot ? 10 - action.roadSlot : 3;
    }

    case 'RESOLVE_BID_STEAL_KC':
      return 8; // stealing is usually strong

    case 'RESOLVE_BID_RETURN':
      return 1; // fallback

    case 'PLACE_HERALD': {
      // Prefer castle (often the best reward location)
      const priorities: Record<string, number> = {
        castle: 5,
        battlefield: 4,
        'harvest-field': 3,
        shrine: 3,
        wilderness: 2,
        necropolis: 1,
      };
      return priorities[action.location] ?? 2;
    }

    case 'PLACE_REGION_CARD': {
      const card = player.hand.find(c => c.uid === action.cardUid);
      if (!card) return 0;
      const def = getCardDef(card.defId);
      // Place strongest cards; prefer highlands (often contested)
      const regionBonus = action.region === 'highlands' ? 2 : action.region === 'plateau' ? 1 : 0;
      return def.strength + regionBonus;
    }

    case 'PLACE_SUPPORTERS': {
      const totalCount = action.placements.reduce((s, p) => s + p.count, 0);
      return totalCount * 3;
    }

    case 'SET_CLASH_ORDER':
      return 5;

    case 'ACTIVATE_AMBUSH': {
      // Good if the ambush card has high strength
      const card = player.hand.find(c => c.uid === action.ambushCardUid);
      if (!card) return 0;
      const def = getCardDef(card.defId);
      return def.strength + 2;
    }

    case 'ACTIVATE_RETREAT':
      return 3; // saving a card is decent

    case 'ACTIVATE_FLANK': {
      // Flanking to a region where we have supporters is good
      const destRegion = state.board.map[action.toRegion];
      const suppCount = destRegion.supporters.find(s => s.playerId === playerId)?.count ?? 0;
      return 2 + suppCount;
    }

    case 'CLAIM_REWARDS':
      return 10; // always take rewards

    case 'TIED_CLASH_PLAY': {
      const card = player.hand.find(c => c.uid === action.cardUid);
      if (!card) return 0;
      const def = getCardDef(card.defId);
      return def.strength;
    }

    case 'TIED_CLASH_PASS':
      return 0;

    case 'GOVERN': {
      const card = player.hand.find(c => c.uid === action.cardUid);
      if (!card) return 0;
      const def = getCardDef(card.defId);
      // Prefer cards with vote icons for council control
      return def.voteIcons * 3 + def.loreIcons;
    }

    case 'JOURNEY': {
      const card = player.hand.find(c => c.uid === action.cardUid);
      if (!card) return 0;
      const def = getCardDef(card.defId);
      return def.loreIcons * 2;
    }

    case 'ACTIVATE_RALLY': {
      // Rally back highest-strength card
      let best = 0;
      for (const region of ['highlands', 'plateau', 'lowlands'] as const) {
        for (const ac of state.board.map[region].activeCards) {
          if (ac.playerId === playerId && action.cardUids.includes(ac.card.uid)) {
            const def = getCardDef(ac.card.defId);
            best = Math.max(best, def.strength);
          }
        }
      }
      return best;
    }

    case 'PASS_ACTION':
    case 'END_TURN':
      return -1;

    default:
      return 0;
  }
}

// ─── Bot decision ──────────────────────────────────────────────────────────────

export function pickAction(state: GameState, playerId: PlayerId): Action | null {
  const actions = getValidActions(state, playerId);
  if (actions.length === 0) return null;

  let best = actions[0];
  let bestScore = scoreAction(state, playerId, best);

  for (let i = 1; i < actions.length; i++) {
    const s = scoreAction(state, playerId, actions[i]);
    if (s > bestScore) {
      bestScore = s;
      best = actions[i];
    }
  }

  return best;
}

export async function runBotTurn(
  state: GameState,
  playerId: PlayerId,
  dispatch: (action: Action) => void,
  delayMs = 600
): Promise<void> {
  const action = pickAction(state, playerId);
  if (!action) return;

  await new Promise<void>(resolve => setTimeout(resolve, delayMs));
  dispatch(action);
}

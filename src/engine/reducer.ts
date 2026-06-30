import {
  GameState, Action, PlayerId, PlayerState,
  CardInstance, KCInstance, Region,
} from './types';
import { createInitialState, getPlayer, mutatePlayer } from './state';
import { resolveClash, checkWinCondition } from './rules';
import { getCardDef } from './data/factions';

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'INIT_GAME':
      return createInitialState(action.config);

    case 'PLACE_BID':
      return applyPlaceBid(state, action.playerId, action.cardUid);

    case 'RESOLVE_BID_TAKE_KC':
      return applyResolveKCTake(state, action.playerId, action.roadSlot);

    case 'RESOLVE_BID_STEAL_KC':
      return applyResolveKCSteal(state, action.playerId, action.targetPlayerId, action.targetSlot);

    case 'RESOLVE_BID_RETURN':
      return applyBidReturn(state, action.playerId);

    case 'PLACE_HERALD':
      return applyPlaceHerald(state, action.playerId, action.location);

    case 'PLACE_REGION_CARD':
      return applyPlaceRegionCard(state, action.playerId, action.region, action.cardUid);

    case 'PLACE_SUPPORTERS':
      return applyPlaceSupporters(state, action.playerId, action.placements);

    case 'SET_CLASH_ORDER':
      return { ...state, board: { ...state.board, clashOrder: action.order, phase: 'summer', step: 'day-action' } };

    case 'ACTIVATE_AMBUSH':
      return applyAmbush(state, action.playerId, action.region, action.sourceCardUid, action.ambushCardUid);

    case 'ACTIVATE_RETREAT':
      return applyRetreat(state, action.playerId, action.region, action.cardUids);

    case 'ACTIVATE_FLANK':
      return applyFlank(state, action.playerId, action.cardUid, action.fromRegion, action.toRegion);

    case 'CLAIM_REWARDS':
      return applyClaimRewards(state, action.playerId, action.region, action.chosenLocation);

    case 'TIED_CLASH_PLAY':
      return applyTiedClashPlay(state, action.playerId, action.region, action.cardUid);

    case 'TIED_CLASH_PASS':
      return applyTiedClashPass(state, action.playerId, action.region);

    case 'GOVERN':
      return applyGovern(state, action.playerId, action.cardUid, action.council);

    case 'JOURNEY':
      return applyJourney(state, action.playerId, action.cardUid);

    case 'SPEND_LORE':
      return state; // complex HQ card effects — stub

    case 'ACTIVATE_RALLY':
      return applyRally(state, action.playerId, action.cardUids);

    case 'ACTIVATE_DEPLOY':
      return state; // stub

    case 'PASS_ACTION':
      return applyPassAction(state, action.playerId);

    case 'END_TURN':
      return advanceTurn(state, action.playerId);

    default:
      return state;
  }
}

// ─── Spring Actions ────────────────────────────────────────────────────────────

function applyPlaceBid(state: GameState, playerId: PlayerId, cardUid: string): GameState {
  return mutatePlayer(state, playerId, player => {
    const card = player.hand.find(c => c.uid === cardUid);
    if (!card) return player;
    return {
      ...player,
      hand: player.hand.filter(c => c.uid !== cardUid),
      bid: card,
    };
  });
}

function applyResolveKCTake(state: GameState, playerId: PlayerId, roadSlot: number): GameState {
  const kc = state.board.greatRoad[roadSlot];
  if (!kc) return state;

  const newRoad = [...state.board.greatRoad];
  newRoad[roadSlot] = null;

  let s = {
    ...state,
    board: { ...state.board, greatRoad: newRoad },
  };

  // Give KC to player (fill first empty slot)
  s = mutatePlayer(s, playerId, player => {
    const slots = [...player.kcSlots] as PlayerState['kcSlots'];
    const emptyIdx = slots.findIndex(slot => slot.kc === null);
    if (emptyIdx >= 0) {
      slots[emptyIdx] = { ...slots[emptyIdx], kc };
    }
    return { ...player, kcSlots: slots, bidResolved: true };
  });

  // Return bid card to discard
  s = returnBidToDiscard(s, playerId);

  return advanceBidding(s);
}

function applyResolveKCSteal(
  state: GameState,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
  targetSlot: 0 | 1
): GameState {
  const target = getPlayer(state, targetPlayerId);
  const kc = target.kcSlots[targetSlot].kc;
  if (!kc) return state;

  // Remove from target
  let s = mutatePlayer(state, targetPlayerId, p => {
    const slots = [...p.kcSlots] as PlayerState['kcSlots'];
    slots[targetSlot] = { ...slots[targetSlot], kc: null };
    return { ...p, kcSlots: slots };
  });

  // Give to thief
  s = mutatePlayer(s, playerId, player => {
    const slots = [...player.kcSlots] as PlayerState['kcSlots'];
    const emptyIdx = slots.findIndex(slot => slot.kc === null);
    if (emptyIdx >= 0) {
      slots[emptyIdx] = { ...slots[emptyIdx], kc };
    }
    return { ...player, kcSlots: slots, bidResolved: true };
  });

  s = returnBidToDiscard(s, playerId);
  return advanceBidding(s);
}

function applyBidReturn(state: GameState, playerId: PlayerId): GameState {
  let s = mutatePlayer(state, playerId, p => ({ ...p, bidResolved: true }));
  s = returnBidToDiscard(s, playerId);
  return advanceBidding(s);
}

function returnBidToDiscard(state: GameState, playerId: PlayerId): GameState {
  return mutatePlayer(state, playerId, p => {
    if (!p.bid) return p;
    return {
      ...p,
      discardPile: [...p.discardPile, p.bid],
      bid: null,
    };
  });
}

function advanceBidding(state: GameState): GameState {
  const allResolved = state.players.every(p => p.bidResolved);
  if (!allResolved) {
    // Find next player who hasn't bid yet
    const nextPlayer = state.orderTrack.find(pid => {
      const p = getPlayer(state, pid);
      return !p.bid && !p.bidResolved;
    }) ?? state.activePlayerId;
    return { ...state, activePlayerId: nextPlayer };
  }

  // Reset bidResolved for next round and advance to herald
  let s = state;
  for (const p of s.players) {
    s = mutatePlayer(s, p.playerId, pl => ({ ...pl, bidResolved: false }));
  }
  return { ...s, board: { ...s.board, step: 'herald' }, activePlayerId: s.orderTrack[0] };
}

function applyPlaceHerald(state: GameState, playerId: PlayerId, location: import('./types').Location): GameState {
  return mutatePlayer(state, playerId, p => ({
    ...p,
    herald: { location },
  }));
}

function applyPlaceRegionCard(
  state: GameState,
  playerId: PlayerId,
  region: Region,
  cardUid: string
): GameState {
  let s = mutatePlayer(state, playerId, p => {
    const card = p.hand.find(c => c.uid === cardUid);
    if (!card) return p;
    return {
      ...p,
      hand: p.hand.filter(c => c.uid !== cardUid),
      regionCards: [...p.regionCards, { region, card, revealed: false }],
    };
  });

  // Place in region
  const player = getPlayer(s, playerId);
  const placed = player.regionCards.find(rc => rc.card.uid === cardUid);
  if (placed) {
    const regionState = s.board.map[region];
    s = {
      ...s,
      board: {
        ...s.board,
        map: {
          ...s.board.map,
          [region]: {
            ...regionState,
            activeCards: [...regionState.activeCards, { playerId, card: placed.card, faceDown: true }],
          },
        },
      },
    };
  }

  return s;
}

function applyPlaceSupporters(
  state: GameState,
  playerId: PlayerId,
  placements: { region: Region; count: number }[]
): GameState {
  let s = state;

  for (const { region, count } of placements) {
    // Move supporters from player board to region
    s = mutatePlayer(s, playerId, p => {
      let placed = 0;
      const supporters = p.supporters.map(sup => {
        if (placed < count && sup.location === 'player-board') {
          placed++;
          return { ...sup, location: region as Region };
        }
        return sup;
      });
      return { ...p, supporters };
    });

    // Update region supporter count
    const regionState = s.board.map[region];
    const existing = regionState.supporters.find(s => s.playerId === playerId);
    const newSupps = existing
      ? regionState.supporters.map(s =>
          s.playerId === playerId ? { ...s, count: s.count + count } : s
        )
      : [...regionState.supporters, { playerId, count }];

    s = {
      ...s,
      board: {
        ...s.board,
        map: { ...s.board.map, [region]: { ...regionState, supporters: newSupps } },
      },
    };
  }

  return s;
}

// ─── Summer Actions ────────────────────────────────────────────────────────────

function applyAmbush(
  state: GameState,
  playerId: PlayerId,
  region: Region,
  sourceCardUid: string,
  ambushCardUid: string
): GameState {
  let s = mutatePlayer(state, playerId, p => {
    const card = p.hand.find(c => c.uid === ambushCardUid);
    if (!card) return p;
    const usedCmds = { ...p.usedCommands };
    usedCmds[sourceCardUid] = [...(usedCmds[sourceCardUid] ?? []), 'ambush'];
    return {
      ...p,
      hand: p.hand.filter(c => c.uid !== ambushCardUid),
      usedCommands: usedCmds,
    };
  });

  const card = getPlayer(state, playerId).hand.find(c => c.uid === ambushCardUid);
  if (!card) return s;

  const regionState = s.board.map[region];
  s = {
    ...s,
    board: {
      ...s.board,
      map: {
        ...s.board.map,
        [region]: {
          ...regionState,
          activeCards: [...regionState.activeCards, { playerId, card, faceDown: true }],
        },
      },
    },
  };

  return s;
}

function applyRetreat(
  state: GameState,
  playerId: PlayerId,
  region: Region,
  cardUids: string[]
): GameState {
  const regionState = state.board.map[region];
  const retreating = regionState.activeCards.filter(
    ac => ac.playerId === playerId && cardUids.includes(ac.card.uid)
  );
  const remaining = regionState.activeCards.filter(
    ac => !(ac.playerId === playerId && cardUids.includes(ac.card.uid))
  );

  let s = {
    ...state,
    board: {
      ...state.board,
      map: { ...state.board.map, [region]: { ...regionState, activeCards: remaining } },
    },
  };

  // Put retreated cards in hand (up to hand size)
  for (const ac of retreating) {
    s = mutatePlayer(s, playerId, p => ({
      ...p,
      hand: [...p.hand, ac.card],
    }));
  }

  return s;
}

function applyFlank(
  state: GameState,
  playerId: PlayerId,
  cardUid: string,
  fromRegion: Region,
  toRegion: Region
): GameState {
  const fromState = state.board.map[fromRegion];
  const ac = fromState.activeCards.find(a => a.playerId === playerId && a.card.uid === cardUid);
  if (!ac) return state;

  const newFrom = { ...fromState, activeCards: fromState.activeCards.filter(a => a.card.uid !== cardUid) };
  const toState = state.board.map[toRegion];
  const newTo = { ...toState, activeCards: [...toState.activeCards, { ...ac, faceDown: true }] };

  let s = {
    ...state,
    board: {
      ...state.board,
      map: { ...state.board.map, [fromRegion]: newFrom, [toRegion]: newTo },
    },
  };

  s = mutatePlayer(s, playerId, p => {
    const usedCmds = { ...p.usedCommands };
    usedCmds[cardUid] = [...(usedCmds[cardUid] ?? []), 'flank'];
    return { ...p, usedCommands: usedCmds };
  });

  return s;
}

function applyClaimRewards(
  state: GameState,
  playerId: PlayerId,
  _region: Region,
  _chosenLocation: import('./types').Location
): GameState {
  // Simplified: winner of clash gains 2 influence
  return mutatePlayer(state, playerId, p => ({
    ...p,
    supply: { ...p.supply, influence: p.supply.influence + 2 },
  }));
}

function applyTiedClashPlay(
  state: GameState,
  playerId: PlayerId,
  region: Region,
  cardUid: string
): GameState {
  let s = mutatePlayer(state, playerId, p => {
    const card = p.hand.find(c => c.uid === cardUid);
    if (!card) return p;
    return { ...p, hand: p.hand.filter(c => c.uid !== cardUid) };
  });

  const card = getPlayer(state, playerId).hand.find(c => c.uid === cardUid);
  if (!card) return s;

  const regionState = s.board.map[region];
  const newPending = regionState.tiePending.filter(pid => pid !== playerId);
  s = {
    ...s,
    board: {
      ...s.board,
      map: {
        ...s.board.map,
        [region]: {
          ...regionState,
          tiePending: newPending,
          activeCards: [...regionState.activeCards, { playerId, card, faceDown: false }],
        },
      },
    },
  };

  if (newPending.length === 0) {
    // Resolve tie
    const result = resolveClash(s, region);
    const regionState2 = s.board.map[region];
    s = {
      ...s,
      board: {
        ...s.board,
        map: {
          ...s.board.map,
          [region]: { ...regionState2, clashes: [...regionState2.clashes, result], resolved: true },
        },
      },
    };
  }

  return s;
}

function applyTiedClashPass(state: GameState, playerId: PlayerId, region: Region): GameState {
  const regionState = state.board.map[region];
  const newPending = regionState.tiePending.filter(pid => pid !== playerId);
  let s = {
    ...state,
    board: {
      ...state.board,
      map: { ...state.board.map, [region]: { ...regionState, tiePending: newPending } },
    },
  };

  if (newPending.length === 0) {
    const result = resolveClash(s, region);
    const rs = s.board.map[region];
    s = {
      ...s,
      board: {
        ...s.board,
        map: {
          ...s.board.map,
          [region]: { ...rs, clashes: [...rs.clashes, result], resolved: true },
        },
      },
    };
  }

  return s;
}

// ─── Autumn Actions ────────────────────────────────────────────────────────────

function applyGovern(
  state: GameState,
  playerId: PlayerId,
  cardUid: string,
  council: import('./types').Council
): GameState {
  const player = getPlayer(state, playerId);
  const card = player.hand.find(c => c.uid === cardUid);
  if (!card) return state;

  const def = getCardDef(card.defId);
  const loreCost = def.loreCost ?? 0;

  let s = mutatePlayer(state, playerId, p => ({
    ...p,
    hand: p.hand.filter(c => c.uid !== cardUid),
    supply: { ...p.supply, lore: p.supply.lore - loreCost },
  }));

  // Add to council
  const councilEntry = { playerId, card };
  const councils = s.board.councils;
  s = {
    ...s,
    board: {
      ...s.board,
      councils: {
        ...councils,
        [council]: [...councils[council], councilEntry],
      },
    },
  };

  // Gain lore icons as lore
  s = mutatePlayer(s, playerId, p => ({
    ...p,
    supply: { ...p.supply, lore: p.supply.lore + def.loreIcons },
  }));

  return s;
}

function applyJourney(state: GameState, playerId: PlayerId, cardUid: string): GameState {
  const player = getPlayer(state, playerId);
  const card = player.hand.find(c => c.uid === cardUid);
  if (!card) return state;

  const def = getCardDef(card.defId);

  return mutatePlayer(state, playerId, p => ({
    ...p,
    hand: p.hand.filter(c => c.uid !== cardUid),
    siteOfPower: [...p.siteOfPower, card],
    supply: { ...p.supply, lore: p.supply.lore + def.loreIcons },
  }));
}

function applyRally(state: GameState, playerId: PlayerId, cardUids: string[]): GameState {
  const regions: Region[] = ['highlands', 'plateau', 'lowlands'];
  let s = state;

  for (const region of regions) {
    const regionState = s.board.map[region];
    const returning = regionState.activeCards.filter(
      ac => ac.playerId === playerId && cardUids.includes(ac.card.uid)
    );
    const remaining = regionState.activeCards.filter(
      ac => !(ac.playerId === playerId && cardUids.includes(ac.card.uid))
    );

    if (returning.length > 0) {
      s = {
        ...s,
        board: {
          ...s.board,
          map: { ...s.board.map, [region]: { ...regionState, activeCards: remaining } },
        },
      };
      for (const ac of returning) {
        s = mutatePlayer(s, playerId, p => {
          const usedCmds = { ...p.usedCommands };
          usedCmds[ac.card.uid] = [...(usedCmds[ac.card.uid] ?? []), 'rally-self'];
          return {
            ...p,
            hand: [...p.hand, ac.card],
            usedCommands: usedCmds,
          };
        });
      }
    }
  }

  return s;
}

function applyPassAction(state: GameState, playerId: PlayerId): GameState {
  const done = [...state.board.actionStepDone, playerId];
  const allDone = state.players.every(p => done.includes(p.playerId));
  if (allDone) {
    return advancePhase(state);
  }
  // Move to next player
  const nextPlayer = getNextPlayer(state, playerId);
  return { ...state, board: { ...state.board, actionStepDone: done }, activePlayerId: nextPlayer };
}

function advanceTurn(state: GameState, playerId: PlayerId): GameState {
  return applyPassAction(state, playerId);
}

function getNextPlayer(state: GameState, currentPlayerId: PlayerId): PlayerId {
  const idx = state.orderTrack.indexOf(currentPlayerId);
  return state.orderTrack[(idx + 1) % state.orderTrack.length];
}

function advancePhase(state: GameState): GameState {
  const { phase, step } = state.board;

  if (phase === 'spring') {
    if (step === 'bid') return { ...state, board: { ...state.board, step: 'herald' } };
    if (step === 'herald') return { ...state, board: { ...state.board, step: 'deploy-cards' } };
    if (step === 'deploy-cards') return { ...state, board: { ...state.board, step: 'deploy-supporters' } };
    if (step === 'deploy-supporters') {
      return {
        ...state,
        board: { ...state.board, phase: 'summer', step: 'clash-order', actionStepDone: [] },
      };
    }
  }

  if (phase === 'summer') {
    const clashOrder = state.board.clashOrder ?? ['highlands', 'plateau', 'lowlands'];
    const nextIdx = state.board.currentClashIndex + 1;
    if (nextIdx < clashOrder.length) {
      return {
        ...state,
        board: {
          ...state.board,
          currentClashIndex: nextIdx,
          step: 'day-action',
          actionStepDone: [],
        },
      };
    }
    // All clashes done, move to Autumn
    return {
      ...state,
      board: {
        ...state.board,
        phase: 'autumn',
        step: 'autumn-actions',
        actionStepDone: [],
        currentClashIndex: 0,
      },
    };
  }

  if (phase === 'autumn') {
    return advanceToWinter(state);
  }

  if (phase === 'winter') {
    return advanceToNewRound(state);
  }

  return state;
}

function advanceToWinter(state: GameState): GameState {
  // Cleanup: move active cards to discard
  let s: GameState = { ...state, board: { ...state.board, phase: 'winter' as const, step: 'cleanup', actionStepDone: [] as PlayerId[] } };

  for (const player of s.players) {
    const regions: Region[] = ['highlands', 'plateau', 'lowlands'];
    let discarded: CardInstance[] = [];

    for (const region of regions) {
      const regionState = s.board.map[region];
      const myCards = regionState.activeCards.filter(ac => ac.playerId === player.playerId);
      discarded = [...discarded, ...myCards.map(ac => ac.card)];
      const remaining = regionState.activeCards.filter(ac => ac.playerId !== player.playerId);
      s = {
        ...s,
        board: {
          ...s.board,
          map: { ...s.board.map, [region]: { ...regionState, activeCards: remaining } },
        },
      };
    }

    s = mutatePlayer(s, player.playerId, p => ({
      ...p,
      discardPile: [...p.discardPile, ...discarded],
      regionCards: [],
      usedCommands: {},
    }));
  }

  return s;
}

function advanceToNewRound(state: GameState): GameState {
  const { round, maxRounds } = state.board;
  const nextRound = round + 1;

  if (nextRound > maxRounds) {
    const { gameOver, winner } = checkWinCondition({ ...state, board: { ...state.board, round: nextRound } });
    return { ...state, gameOver, winner };
  }

  // Refresh deck from discard if empty
  let s = state;
  for (const player of s.players) {
    if (player.deck.length < player.handSize) {
      s = mutatePlayer(s, player.playerId, p => {
        const newDeck = shuffleArr([...p.deck, ...p.discardPile]);
        const newHand = newDeck.splice(0, p.handSize);
        return { ...p, deck: newDeck, discardPile: [], hand: [...p.hand, ...newHand] };
      });
    }
  }

  return {
    ...s,
    board: {
      ...s.board,
      round: nextRound,
      phase: 'spring',
      step: 'bid',
      actionStepDone: [],
      currentClashIndex: 0,
      clashOrder: null,
    },
  };
}

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

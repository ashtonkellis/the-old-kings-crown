import {
  GameState, Action, PlayerId, PlayerState,
  CardInstance, KCInstance, Region, Location,
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

    case 'SET_CLASH_ORDER': {
      const firstRegion = action.order[0];
      let s: GameState = {
        ...state,
        board: {
          ...state.board,
          clashOrder: action.order,
          phase: 'summer' as const,
          step: 'day-action',
          currentClashIndex: 0,
          actionStepDone: [],
        },
        activePlayerId: state.orderTrack[0],
      };
      s = revealCardsInRegion(s, firstRegion);
      return s;
    }

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
      return applySpendLore(state, action.playerId, action.siteCardUid);

    case 'ACTIVATE_RALLY':
      return applyRally(state, action.playerId, action.cardUids);

    case 'ACTIVATE_DEPLOY':
      return applyDeploy(state, action.playerId, action.cardUid, action.region);

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

function applyResolveKCSteal(
  state: GameState,
  playerId: PlayerId,
  targetPlayerId: PlayerId,
  targetSlot: 0 | 1
): GameState {
  const target = getPlayer(state, targetPlayerId);
  const kc = target.kcSlots[targetSlot].kc;
  if (!kc) return state;

  let s = mutatePlayer(state, targetPlayerId, p => {
    const slots = [...p.kcSlots] as PlayerState['kcSlots'];
    slots[targetSlot] = { ...slots[targetSlot], kc: null };
    return { ...p, kcSlots: slots };
  });

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

function repopulateGreatRoad(state: GameState, anyKCTaken: boolean): GameState {
  let road = [...state.board.greatRoad] as (KCInstance | null)[];
  let deck = [...state.board.kingdomDeck];
  let discard = [...state.board.kingdomDiscard];
  const ROAD_SIZE = 4;

  if (!anyKCTaken) {
    // No KCs taken: move two rightmost cards to discard
    let moved = 0;
    for (let i = ROAD_SIZE - 1; i >= 0 && moved < 2; i--) {
      if (road[i] !== null) {
        discard.push(road[i]!);
        road[i] = null;
        moved++;
      }
    }
  } else {
    // KCs were taken: move rightmost remaining card to discard
    for (let i = ROAD_SIZE - 1; i >= 0; i--) {
      if (road[i] !== null) {
        discard.push(road[i]!);
        road[i] = null;
        break;
      }
    }
  }

  // Compact non-null cards to the right
  const nonNull = road.filter(c => c !== null) as KCInstance[];
  road = new Array(ROAD_SIZE).fill(null) as (KCInstance | null)[];
  for (let i = 0; i < nonNull.length; i++) {
    road[ROAD_SIZE - nonNull.length + i] = nonNull[i];
  }

  // Fill empty slots from deck (rightmost first)
  for (let i = ROAD_SIZE - 1; i >= 0; i--) {
    if (road[i] === null && deck.length > 0) {
      road[i] = deck.shift()!;
    }
  }

  return {
    ...state,
    board: { ...state.board, greatRoad: road, kingdomDeck: deck, kingdomDiscard: discard },
  };
}

function advanceBidding(state: GameState): GameState {
  const allResolved = state.players.every(p => p.bidResolved);
  if (!allResolved) {
    const nextPlayer = state.orderTrack.find(pid => {
      const p = getPlayer(state, pid);
      return !p.bid && !p.bidResolved;
    }) ?? state.activePlayerId;
    return { ...state, activePlayerId: nextPlayer };
  }

  // Repopulate Great Road before advancing to herald
  const anyKCTaken = state.board.greatRoad.some(slot => slot === null);
  let s = repopulateGreatRoad(state, anyKCTaken);

  // Reset bidResolved for next round and advance to herald
  for (const p of s.players) {
    s = mutatePlayer(s, p.playerId, pl => ({ ...pl, bidResolved: false }));
  }
  return { ...s, board: { ...s.board, step: 'herald', actionStepDone: [] }, activePlayerId: s.orderTrack[0] };
}

function applyPlaceHerald(state: GameState, playerId: PlayerId, location: Location): GameState {
  const regionLocMap: Record<Location, import('./types').Region> = {
    'castle':       'highlands',
    'wilderness':   'highlands',
    'harvest-field': 'plateau',
    'battlefield':  'plateau',
    'shrine':       'lowlands',
    'necropolis':   'lowlands',
  };
  const region = regionLocMap[location];

  let s = mutatePlayer(state, playerId, p => ({
    ...p,
    herald: { location },
  }));

  // Mark herald owner in location state
  const rs = s.board.map[region];
  s = {
    ...s,
    board: {
      ...s.board,
      map: {
        ...s.board.map,
        [region]: {
          ...rs,
          locations: {
            ...rs.locations,
            [location]: { ...rs.locations[location], heraldOwner: playerId },
          },
        },
      },
    },
  };

  return s;
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

function revealCardsInRegion(state: GameState, region: Region): GameState {
  const regionState = state.board.map[region];
  const revealed = regionState.activeCards.map(ac => ({ ...ac, faceDown: false }));
  return {
    ...state,
    board: {
      ...state.board,
      map: { ...state.board.map, [region]: { ...regionState, activeCards: revealed } },
    },
  };
}

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

function applyDeadlyNight(state: GameState, region: Region): GameState {
  const regionState = state.board.map[region];

  // Find players who have a Deadly card active and face-up
  const deadlyPlayerIds = new Set<PlayerId>();
  for (const ac of regionState.activeCards) {
    if (ac.faceDown) continue;
    const def = getCardDef(ac.card.defId);
    if (def.commands.some(c => c.type === 'deadly' && c.step === 'night')) {
      deadlyPlayerIds.add(ac.playerId);
    }
  }

  if (deadlyPlayerIds.size === 0) return state;

  // Cards to eliminate: opponents of Deadly players that aren't Invulnerable
  const toEliminate: { card: CardInstance; ownerId: PlayerId }[] = [];
  for (const ac of regionState.activeCards) {
    if (ac.faceDown) continue;
    if (deadlyPlayerIds.has(ac.playerId)) continue;
    // Only targeted if at least one of the OPPONENT's enemies has Deadly
    const hasDeadlyOpponent = regionState.activeCards.some(
      other => !other.faceDown && other.playerId !== ac.playerId && deadlyPlayerIds.has(other.playerId)
    );
    if (!hasDeadlyOpponent) continue;
    const def = getCardDef(ac.card.defId);
    if (def.traits.includes('invulnerable')) continue;
    toEliminate.push({ card: ac.card, ownerId: ac.playerId });
  }

  if (toEliminate.length === 0) return state;

  const surviving = regionState.activeCards.filter(
    ac => !toEliminate.some(e => e.card.uid === ac.card.uid)
  );
  let s: GameState = {
    ...state,
    board: {
      ...state.board,
      map: { ...state.board.map, [region]: { ...regionState, activeCards: surviving } },
    },
  };

  for (const { card, ownerId } of toEliminate) {
    const def = getCardDef(card.defId);
    if (def.traits.includes('resilient')) {
      s = mutatePlayer(s, ownerId, p => ({ ...p, discardPile: [...p.discardPile, card] }));
    } else {
      s = { ...s, board: { ...s.board, lostPile: [...s.board.lostPile, card] } };
    }
  }

  return s;
}

function takeFromReserve(state: GameState, type: 'influence' | 'lore', amount: number): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      reserve: {
        ...state.board.reserve,
        [type]: Math.max(0, state.board.reserve[type] - amount),
      },
    },
  };
}

function advanceAfterReward(state: GameState, region: Region): GameState {
  let s: GameState = {
    ...state,
    board: {
      ...state.board,
      map: {
        ...state.board.map,
        [region]: { ...state.board.map[region], resolved: true },
      },
    },
  };

  const clashOrder = s.board.clashOrder ?? (['highlands', 'plateau', 'lowlands'] as Region[]);
  const nextIdx = s.board.currentClashIndex + 1;

  if (nextIdx < clashOrder.length) {
    const nextRegion = clashOrder[nextIdx];
    s = revealCardsInRegion(s, nextRegion);
    return {
      ...s,
      board: {
        ...s.board,
        phase: 'summer' as const,
        step: 'day-action',
        currentClashIndex: nextIdx,
        actionStepDone: [],
      },
      activePlayerId: s.orderTrack[0],
    };
  }

  // All clashes done → Autumn
  return {
    ...s,
    board: {
      ...s.board,
      phase: 'autumn' as const,
      step: 'autumn-actions',
      currentClashIndex: 0,
      actionStepDone: [],
    },
    activePlayerId: s.orderTrack[0],
  };
}

function applyClaimRewards(
  state: GameState,
  playerId: PlayerId,
  region: Region,
  chosenLocation: Location
): GameState {
  let s = state;
  const regionState = s.board.map[region];
  const locState = regionState.locations[chosenLocation];

  // ── Herald Reward ────────────────────────────────────────────────────────────
  if (locState.heraldOwner === playerId) {
    s = mutatePlayer(s, playerId, p => ({
      ...p,
      supply: { ...p.supply, influence: p.supply.influence + 1 },
    }));
    s = takeFromReserve(s, 'influence', 1);

    // Steal 1 from each opponent with a herald at this same location
    for (const other of s.players) {
      if (other.playerId === playerId) continue;
      if (s.board.map[region].locations[chosenLocation].heraldOwner === other.playerId) {
        const steal = Math.min(1, other.supply.influence);
        s = mutatePlayer(s, other.playerId, p => ({
          ...p,
          supply: { ...p.supply, influence: p.supply.influence - steal },
        }));
        s = mutatePlayer(s, playerId, p => ({
          ...p,
          supply: { ...p.supply, influence: p.supply.influence + steal },
        }));
      }
    }
  }

  // ── Location Reward ──────────────────────────────────────────────────────────
  switch (chosenLocation) {
    case 'castle':
      // Govern with 1 card — simplified: gain 1 Influence
      s = mutatePlayer(s, playerId, p => ({
        ...p,
        supply: { ...p.supply, influence: p.supply.influence + 1 },
      }));
      s = takeFromReserve(s, 'influence', 1);
      break;

    case 'wilderness':
      // Journey with 1 card — gain 1 Lore
      s = mutatePlayer(s, playerId, p => ({
        ...p,
        supply: { ...p.supply, lore: p.supply.lore + 1 },
      }));
      s = takeFromReserve(s, 'lore', 1);
      break;

    case 'harvest-field': {
      // Gain 1 Influence + claim Kingdom's Favour
      s = mutatePlayer(s, playerId, p => ({
        ...p,
        supply: { ...p.supply, influence: p.supply.influence + 1 },
      }));
      s = takeFromReserve(s, 'influence', 1);
      // Remove Favour from previous holder
      const prevFavour = s.board.favourLocation;
      if (typeof prevFavour === 'number') {
        s = mutatePlayer(s, prevFavour as PlayerId, p => ({
          ...p,
          holdsFavour: false,
          favourUsesLeft: 0,
        }));
      }
      s = mutatePlayer(s, playerId, p => ({
        ...p,
        holdsFavour: true,
        favourUsesLeft: 3,
      }));
      s = { ...s, board: { ...s.board, favourLocation: playerId } };
      break;
    }

    case 'battlefield':
      // Gain 2 Influence
      s = mutatePlayer(s, playerId, p => ({
        ...p,
        supply: { ...p.supply, influence: p.supply.influence + 2 },
      }));
      s = takeFromReserve(s, 'influence', 2);
      break;

    case 'shrine':
      // Move up to 3 cards to bottom of Deck — simplified: gain 1 Lore
      s = mutatePlayer(s, playerId, p => ({
        ...p,
        supply: { ...p.supply, lore: p.supply.lore + 1 },
      }));
      s = takeFromReserve(s, 'lore', 1);
      break;

    case 'necropolis':
      // Shuffle Discard into Deck, draw up to 3
      s = mutatePlayer(s, playerId, p => {
        const newDeck = shuffleArr([...p.deck, ...p.discardPile]);
        const drawCount = Math.min(3, newDeck.length);
        return {
          ...p,
          deck: newDeck.slice(drawCount),
          discardPile: [],
          hand: [...p.hand, ...newDeck.slice(0, drawCount)],
        };
      });
      break;
  }

  return advanceAfterReward(s, region);
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

  // Remove from hand
  let s = mutatePlayer(state, playerId, p => ({
    ...p,
    hand: p.hand.filter(c => c.uid !== cardUid),
  }));

  // Add to council
  const councils = s.board.councils;
  s = {
    ...s,
    board: {
      ...s.board,
      councils: {
        ...councils,
        [council]: [...councils[council], { playerId, card }],
      },
    },
  };

  // Gain lore from lore icons on governed card
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

  // Remove from hand, gain lore
  let s = mutatePlayer(state, playerId, p => ({
    ...p,
    hand: p.hand.filter(c => c.uid !== cardUid),
    supply: { ...p.supply, lore: p.supply.lore + def.loreIcons },
  }));

  // Pathfinder → Discard; otherwise → Lost Pile
  if (def.traits.includes('pathfinder')) {
    s = mutatePlayer(s, playerId, p => ({
      ...p,
      discardPile: [...p.discardPile, card],
    }));
  } else {
    s = { ...s, board: { ...s.board, lostPile: [...s.board.lostPile, card] } };
  }

  return s;
}

function applySpendLore(state: GameState, playerId: PlayerId, siteCardUid: string): GameState {
  const player = getPlayer(state, playerId);
  const siteCard = player.siteOfPower.find(c => c.uid === siteCardUid);
  if (!siteCard) return state;

  const def = getCardDef(siteCard.defId);
  const cost = def.loreCost ?? 0;
  if (player.supply.lore < cost) return state;

  // Pay cost, remove from site of power
  let s = mutatePlayer(state, playerId, p => ({
    ...p,
    siteOfPower: p.siteOfPower.filter(c => c.uid !== siteCardUid),
    supply: { ...p.supply, lore: p.supply.lore - cost },
  }));

  if (def.isHQ) {
    // HQ cards go to player supply (persistent)
    s = mutatePlayer(s, playerId, p => ({
      ...p,
      hqCards: [...p.hqCards, siteCard],
    }));
  } else {
    // Advanced cards go to hand (or top of deck if hand is full)
    s = mutatePlayer(s, playerId, p => {
      if (p.hand.length < p.handSize) {
        return { ...p, hand: [...p.hand, siteCard] };
      } else {
        return { ...p, deck: [siteCard, ...p.deck] };
      }
    });
  }

  return s;
}

function applyDeploy(
  state: GameState,
  playerId: PlayerId,
  cardUid: string,
  region: Region
): GameState {
  const player = getPlayer(state, playerId);
  const card = player.hand.find(c => c.uid === cardUid);
  if (!card) return state;

  const def = getCardDef(card.defId);
  const deployCmd = def.commands.find(c => c.type === 'deploy');
  const deployValue = deployCmd?.value ?? 1;

  if (state.board.reserve.influence < deployValue) return state;

  // Remove from hand, mark command used
  let s = mutatePlayer(state, playerId, p => ({
    ...p,
    hand: p.hand.filter(c => c.uid !== cardUid),
    usedCommands: {
      ...p.usedCommands,
      [cardUid]: [...(p.usedCommands[cardUid] ?? []), 'deploy' as const],
    },
  }));

  // Card enters the region with influence tokens
  const cardWithInfluence: CardInstance = { ...card, influenceOnCard: deployValue };

  // Deduct from Reserve
  s = takeFromReserve(s, 'influence', deployValue);

  // Add to region as Active (face-up)
  const regionState = s.board.map[region];
  s = {
    ...s,
    board: {
      ...s.board,
      map: {
        ...s.board.map,
        [region]: {
          ...regionState,
          activeCards: [...regionState.activeCards, { playerId, card: cardWithInfluence, faceDown: false }],
        },
      },
    },
  };

  return s;
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

// ─── Phase Advancement ─────────────────────────────────────────────────────────

function applyPassAction(state: GameState, playerId: PlayerId): GameState {
  const done = [...state.board.actionStepDone, playerId];
  const allDone = state.players.every(p => done.includes(p.playerId));

  if (!allDone) {
    const nextPlayer = getNextPlayer(state, playerId);
    return { ...state, board: { ...state.board, actionStepDone: done }, activePlayerId: nextPlayer };
  }

  // All done — handle summer day-action specially
  if (state.board.phase === 'summer' && state.board.step === 'day-action') {
    const clashOrder = state.board.clashOrder ?? (['highlands', 'plateau', 'lowlands'] as Region[]);
    const region = clashOrder[state.board.currentClashIndex];

    // 1. Apply Deadly Night Effects
    let s = applyDeadlyNight(state, region);

    // 2. Resolve Clash
    const result = resolveClash(s, region);
    const rs = s.board.map[region];
    s = {
      ...s,
      board: {
        ...s.board,
        actionStepDone: [],
        map: { ...s.board.map, [region]: { ...rs, clashes: [...rs.clashes, result] } },
      },
    };

    if (result.winnerId !== null) {
      return {
        ...s,
        board: { ...s.board, step: 'claim-rewards' },
        activePlayerId: result.winnerId,
      };
    } else {
      // Tie — advance without rewards
      return advanceAfterReward(s, region);
    }
  }

  return advancePhase({ ...state, board: { ...state.board, actionStepDone: done } });
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
    if (step === 'bid') {
      return {
        ...state,
        board: { ...state.board, step: 'herald', actionStepDone: [] },
        activePlayerId: state.orderTrack[0],
      };
    }
    if (step === 'herald') {
      return {
        ...state,
        board: { ...state.board, step: 'deploy-cards', actionStepDone: [] },
        activePlayerId: state.orderTrack[0],
      };
    }
    if (step === 'deploy-cards') {
      return {
        ...state,
        board: { ...state.board, step: 'deploy-supporters', actionStepDone: [] },
        activePlayerId: state.orderTrack[0],
      };
    }
    if (step === 'deploy-supporters') {
      // Last player on Order Track sets clash markers
      return {
        ...state,
        board: { ...state.board, phase: 'summer', step: 'clash-order', actionStepDone: [] },
        activePlayerId: state.orderTrack[state.orderTrack.length - 1],
      };
    }
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
  const REGIONS: Region[] = ['highlands', 'plateau', 'lowlands'];
  const ALL_LOCS: Location[] = ['castle', 'wilderness', 'harvest-field', 'battlefield', 'shrine', 'necropolis'];

  let s: GameState = {
    ...state,
    board: {
      ...state.board,
      phase: 'winter' as const,
      step: 'cleanup',
      actionStepDone: [] as PlayerId[],
      clashOrder: null,
      currentClashIndex: 0,
    },
  };

  // 1. Return heralds to player boards; clear location heraldOwner
  for (const p of s.players) {
    s = mutatePlayer(s, p.playerId, pl => ({ ...pl, herald: { location: 'player-board' as const } }));
  }
  for (const region of REGIONS) {
    const rs = s.board.map[region];
    const updatedLocs = { ...rs.locations };
    for (const loc of ALL_LOCS) {
      updatedLocs[loc] = { ...updatedLocs[loc], heraldOwner: null };
    }
    s = {
      ...s,
      board: {
        ...s.board,
        map: { ...s.board.map, [region]: { ...rs, locations: updatedLocs } },
      },
    };
  }

  // 2. Move all Supporters on map to Lost Pile
  for (const region of REGIONS) {
    const rs = s.board.map[region];
    for (const suppEntry of rs.supporters) {
      for (let i = 0; i < suppEntry.count; i++) {
        s = {
          ...s,
          board: {
            ...s.board,
            lostPile: [
              ...s.board.lostPile,
              { type: 'supporter' as const, playerId: suppEntry.playerId, supporterId: 0 },
            ],
          },
        };
      }
    }
    s = {
      ...s,
      board: {
        ...s.board,
        map: { ...s.board.map, [region]: { ...s.board.map[region], supporters: [] } },
      },
    };
  }
  // Update supporter pieces on player boards
  for (const p of s.players) {
    s = mutatePlayer(s, p.playerId, pl => ({
      ...pl,
      supporters: pl.supporters.map(sup =>
        sup.location !== 'player-board' ? { ...sup, location: 'lost-pile' as const } : sup
      ),
    }));
  }

  // 3. Active cards: with Influence → remove 1 token (stay); without → discard
  for (const region of REGIONS) {
    const rs = s.board.map[region];
    const staying: typeof rs.activeCards = [];
    const going: { card: CardInstance; ownerId: PlayerId }[] = [];

    for (const ac of rs.activeCards) {
      if (ac.card.influenceOnCard > 0) {
        staying.push({ ...ac, card: { ...ac.card, influenceOnCard: ac.card.influenceOnCard - 1 } });
      } else {
        going.push({ card: ac.card, ownerId: ac.playerId });
      }
    }

    s = {
      ...s,
      board: {
        ...s.board,
        map: {
          ...s.board.map,
          [region]: {
            ...rs,
            activeCards: staying,
            clashMarker: null,
            resolved: false,
            clashes: [],
            dayActionPending: [],
            tiePending: [],
          },
        },
      },
    };

    for (const { card, ownerId } of going) {
      s = mutatePlayer(s, ownerId, p => ({ ...p, discardPile: [...p.discardPile, card] }));
    }
  }

  // 4. Clear bids, regionCards, usedCommands
  for (const p of s.players) {
    s = mutatePlayer(s, p.playerId, pl => ({
      ...pl,
      bid: null,
      bidResolved: false,
      regionCards: [],
      usedCommands: {},
    }));
  }

  return s;
}

function advanceToNewRound(state: GameState): GameState {
  const nextRound = state.board.round + 1;

  if (nextRound > state.board.maxRounds) {
    const { gameOver, winner } = checkWinCondition(state);
    return { ...state, gameOver, winner };
  }

  let s = state;

  // Re-sort Order Track by Influence (highest first; tiebreak: maintain previous order)
  const sorted = [...s.players].sort((a, b) => {
    const diff = b.supply.influence - a.supply.influence;
    return diff !== 0 ? diff : a.orderPosition - b.orderPosition;
  });
  const newOrderTrack = sorted.map(p => p.playerId);
  s = {
    ...s,
    orderTrack: newOrderTrack,
    players: s.players.map(p => ({
      ...p,
      orderPosition: newOrderTrack.indexOf(p.playerId),
    })),
  };

  // Start of Year: draw cards up to hand size; Attrition if deck runs out
  for (const player of s.players) {
    const deficit = player.handSize - player.hand.length;
    if (deficit <= 0) continue;

    let deck = [...player.deck];
    let discard = [...player.discardPile];
    let hand = [...player.hand];
    let handSize = player.handSize;
    let toDraw = deficit;

    while (toDraw > 0) {
      if (deck.length === 0) {
        if (discard.length === 0) break;
        // Attrition: shuffle discard into new deck, reduce hand size by 1
        deck = shuffleArr(discard);
        discard = [];
        handSize = Math.max(3, handSize - 1);
      }
      hand.push(deck.shift()!);
      toDraw--;
    }

    // Trim to new hand size if needed
    while (hand.length > handSize) {
      discard.push(hand.pop()!);
    }

    s = mutatePlayer(s, player.playerId, p => ({
      ...p,
      deck,
      discardPile: discard,
      hand,
      handSize,
    }));
  }

  return {
    ...s,
    board: {
      ...s.board,
      round: nextRound,
      phase: 'spring' as const,
      step: 'bid',
      actionStepDone: [] as PlayerId[],
      currentClashIndex: 0,
      clashOrder: null,
    },
    activePlayerId: newOrderTrack[0],
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

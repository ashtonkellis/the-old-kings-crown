import {
  GameState, Action, PlayerId, Region, Location,
  CardInstance,
} from './types';
import { getPlayer } from './state';
import { getCardDef } from './data/factions';

// ─── Public API ────────────────────────────────────────────────────────────────

export function getValidActions(state: GameState, playerId: PlayerId): Action[] {
  if (state.gameOver) return [];
  if (state.activePlayerId !== playerId) return [];

  const player = getPlayer(state, playerId);
  const { phase, step } = state.board;

  const actions: Action[] = [];

  if (phase === 'spring') {
    if (step === 'bid') {
      if (!player.bid) {
        for (const card of player.hand) {
          actions.push({ type: 'PLACE_BID', playerId, cardUid: card.uid });
        }
      } else if (!player.bidResolved) {
        for (let slot = 0; slot < state.board.greatRoad.length; slot++) {
          if (state.board.greatRoad[slot] !== null) {
            actions.push({ type: 'RESOLVE_BID_TAKE_KC', playerId, roadSlot: slot });
          }
        }
        for (const other of state.players) {
          if (other.playerId === playerId) continue;
          other.kcSlots.forEach((slot, idx) => {
            if (slot.kc !== null) {
              actions.push({
                type: 'RESOLVE_BID_STEAL_KC',
                playerId,
                targetPlayerId: other.playerId,
                targetSlot: idx as 0 | 1,
              });
            }
          });
        }
        actions.push({ type: 'RESOLVE_BID_RETURN', playerId });
      }
    }

    if (step === 'herald') {
      if (player.herald.location === 'player-board') {
        const heraldLocations: Location[] = [
          'castle', 'wilderness', 'harvest-field', 'battlefield', 'shrine', 'necropolis',
        ];
        for (const loc of heraldLocations) {
          actions.push({ type: 'PLACE_HERALD', playerId, location: loc });
        }
      } else {
        actions.push({ type: 'PASS_ACTION', playerId });
      }
    }

    if (step === 'deploy-cards') {
      const regions: Region[] = ['highlands', 'plateau', 'lowlands'];
      for (const card of player.hand) {
        for (const region of regions) {
          actions.push({ type: 'PLACE_REGION_CARD', playerId, region, cardUid: card.uid });
        }
      }
      actions.push({ type: 'PASS_ACTION', playerId });
    }

    if (step === 'deploy-supporters') {
      const available = player.supporters.filter(s => s.location === 'player-board').length;
      if (available > 0) {
        actions.push({
          type: 'PLACE_SUPPORTERS',
          playerId,
          placements: [{ region: 'highlands', count: 1 }],
        });
      }
      actions.push({ type: 'PASS_ACTION', playerId });
    }
  }

  if (phase === 'summer') {
    if (step === 'clash-order') {
      actions.push({
        type: 'SET_CLASH_ORDER',
        playerId,
        order: ['highlands', 'plateau', 'lowlands'],
      });
    }

    if (step === 'day-action') {
      const regions: Region[] = ['highlands', 'plateau', 'lowlands'];
      for (const region of regions) {
        const regionState = state.board.map[region];
        const myCards = regionState.activeCards.filter(ac => ac.playerId === playerId && !ac.faceDown);

        for (const ac of myCards) {
          const def = getCardDef(ac.card.defId);
          const usedCmds = player.usedCommands[ac.card.uid] ?? [];

          for (const cmd of def.commands) {
            if (cmd.step !== 'day') continue;
            if (usedCmds.includes(cmd.type)) continue;

            if (cmd.type === 'ambush') {
              for (const handCard of player.hand) {
                actions.push({
                  type: 'ACTIVATE_AMBUSH',
                  playerId,
                  region,
                  sourceCardUid: ac.card.uid,
                  ambushCardUid: handCard.uid,
                });
              }
            }

            if (cmd.type === 'retreat') {
              actions.push({
                type: 'ACTIVATE_RETREAT',
                playerId,
                region,
                cardUids: [ac.card.uid],
                retreatHerald: false,
              });
            }

            if (cmd.type === 'flank') {
              const otherRegions = regions.filter(r => r !== region);
              for (const toRegion of otherRegions) {
                actions.push({
                  type: 'ACTIVATE_FLANK',
                  playerId,
                  cardUid: ac.card.uid,
                  fromRegion: region,
                  toRegion,
                });
              }
            }
          }
        }
      }

      // Tied clash options
      const currentRegion = state.board.clashOrder?.[state.board.currentClashIndex];
      if (currentRegion) {
        const regionState = state.board.map[currentRegion];
        if (regionState.tiePending.includes(playerId)) {
          for (const card of player.hand) {
            actions.push({ type: 'TIED_CLASH_PLAY', playerId, region: currentRegion, cardUid: card.uid });
          }
          actions.push({ type: 'TIED_CLASH_PASS', playerId, region: currentRegion });
        }
      }

      // Always allow passing the day action
      actions.push({ type: 'PASS_ACTION', playerId });
    }

    if (step === 'claim-rewards') {
      const currentR = state.board.clashOrder?.[state.board.currentClashIndex];
      if (currentR) {
        const locs: Location[] = ['castle', 'wilderness', 'harvest-field', 'battlefield', 'shrine', 'necropolis'];
        for (const loc of locs) {
          actions.push({ type: 'CLAIM_REWARDS', playerId, region: currentR, chosenLocation: loc });
        }
      }
    }
  }

  if (phase === 'autumn') {
    if (step === 'autumn-actions') {
      // Govern: send a card with voteIcons to a council
      const councils = ['relics', 'secrets', 'oaths'] as const;
      for (const card of player.hand) {
        const def = getCardDef(card.defId);
        if (def.voteIcons > 0) {
          for (const council of councils) {
            actions.push({ type: 'GOVERN', playerId, cardUid: card.uid, council });
          }
        }
      }

      // Journey: send a card with loreIcons to Lost Pile, gain lore
      for (const card of player.hand) {
        const def = getCardDef(card.defId);
        if (def.loreIcons > 0) {
          actions.push({ type: 'JOURNEY', playerId, cardUid: card.uid });
        }
      }

      // Deploy: play card from hand face-up to a region with influence from Reserve
      const regions: Region[] = ['highlands', 'plateau', 'lowlands'];
      for (const card of player.hand) {
        const def = getCardDef(card.defId);
        const usedCmds = player.usedCommands[card.uid] ?? [];
        const hasUnusedDeploy = def.commands.some(
          c => c.type === 'deploy' && c.step === 'autumn' && !usedCmds.includes('deploy')
        );
        if (hasUnusedDeploy) {
          const deployCmd = def.commands.find(c => c.type === 'deploy');
          const deployValue = deployCmd?.value ?? 1;
          if (state.board.reserve.influence >= deployValue) {
            for (const region of regions) {
              actions.push({ type: 'ACTIVATE_DEPLOY', playerId, cardUid: card.uid, region });
            }
          }
        }
      }

      // Spend Lore: acquire card from Site of Power
      for (const siteCard of player.siteOfPower) {
        const def = getCardDef(siteCard.defId);
        const cost = def.loreCost ?? 0;
        if (player.supply.lore >= cost) {
          actions.push({ type: 'SPEND_LORE', playerId, siteCardUid: siteCard.uid });
        }
      }

      // Rally: bring active cards back to hand
      for (const region of regions) {
        const regionState = state.board.map[region];
        const myCards = regionState.activeCards.filter(ac => ac.playerId === playerId);
        for (const ac of myCards) {
          const def = getCardDef(ac.card.defId);
          const usedCmds = player.usedCommands[ac.card.uid] ?? [];
          const hasRally = def.commands.some(
            c => (c.type === 'rally-self' || c.type === 'rally-any') && c.step === 'autumn'
          );
          if (hasRally && !usedCmds.includes('rally-self') && !usedCmds.includes('rally-any')) {
            actions.push({ type: 'ACTIVATE_RALLY', playerId, cardUids: [ac.card.uid] });
          }
        }
      }

      actions.push({ type: 'PASS_ACTION', playerId });
    }
  }

  // Fallback END_TURN only in phases with no actions to take
  if (actions.length === 0 && (phase === 'winter' || phase === 'start-of-year')) {
    actions.push({ type: 'END_TURN', playerId });
  }

  // De-duplicate actions
  const seen = new Set<string>();
  return actions.filter(a => {
    const key = JSON.stringify(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isValidAction(state: GameState, action: Action): boolean {
  if (!('playerId' in action)) return false;
  const valid = getValidActions(state, action.playerId);
  return valid.some(a => JSON.stringify(a) === JSON.stringify(action));
}

// ─── Clash Strength ────────────────────────────────────────────────────────────

export function getClashStrength(
  state: GameState,
  playerId: PlayerId,
  region: Region
): number {
  const regionState = state.board.map[region];
  const myCards = regionState.activeCards.filter(ac => ac.playerId === playerId && !ac.faceDown);
  const mySupporters = regionState.supporters.find(s => s.playerId === playerId)?.count ?? 0;

  let total = myCards.reduce((sum, ac) => {
    const def = getCardDef(ac.card.defId);
    return sum + def.strength + (ac.card.influenceOnCard > 0 ? 1 : 0);
  }, 0);

  total += mySupporters;

  return total;
}

export function resolveClash(
  state: GameState,
  region: Region
): { winnerId: PlayerId | null; strengths: { playerId: PlayerId; total: number }[]; tiebroken: boolean } {
  const strengths = state.players
    .filter(p => {
      const rs = state.board.map[region];
      return rs.activeCards.some(ac => ac.playerId === p.playerId);
    })
    .map(p => ({
      playerId: p.playerId,
      total: getClashStrength(state, p.playerId, region),
    }));

  if (strengths.length === 0) return { winnerId: null, strengths: [], tiebroken: false };

  const max = Math.max(...strengths.map(s => s.total));
  const tied = strengths.filter(s => s.total === max);

  if (tied.length === 1) {
    return { winnerId: tied[0].playerId, strengths, tiebroken: false };
  }

  // Tiebreaker: order track position (first in order wins)
  const tieWinner = state.orderTrack.find(pid =>
    tied.some(t => t.playerId === pid)
  ) ?? null;

  return { winnerId: tieWinner, strengths, tiebroken: true };
}

// ─── Win Condition ─────────────────────────────────────────────────────────────

export function checkWinCondition(state: GameState): { gameOver: boolean; winner: PlayerId | null } {
  const scores = state.players.map(p => ({ playerId: p.playerId, inf: p.supply.influence }));
  scores.sort((a, b) => b.inf - a.inf);

  const topScore = scores[0].inf;
  const topTied = scores.filter(s => s.inf === topScore);

  if (topTied.length === 1) {
    return { gameOver: true, winner: topTied[0].playerId };
  }

  // Tiebreak 1: holds Kingdom's Favour
  const withFavour = state.players.find(p => p.holdsFavour);
  if (withFavour && topTied.some(s => s.playerId === withFavour.playerId)) {
    return { gameOver: true, winner: withFavour.playerId };
  }

  // Tiebreak 2: highest on Order Track (first = wins)
  for (const pid of state.orderTrack) {
    if (topTied.some(s => s.playerId === pid)) {
      return { gameOver: true, winner: pid };
    }
  }

  return { gameOver: true, winner: null };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function findCardInHand(state: GameState, playerId: PlayerId, cardUid: string): CardInstance | undefined {
  return getPlayer(state, playerId).hand.find(c => c.uid === cardUid);
}

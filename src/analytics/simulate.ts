import { Faction, PlayerId } from '../engine/types';
import { createInitialState } from '../engine/state';
import { applyAction } from '../engine/reducer';
import { BOT_REGISTRY } from '../ai/bot';
import { buildRecord, appendRecord, GameRecord, PlayerType } from './log';

export interface PlayerSlot {
  faction: Faction;
  botVersion: string;
}

const MAX_STEPS = 5000;

export function runGame(
  slots: PlayerSlot[],
  gameLength: 'short' | 'standard' | 'extended' = 'standard'
): GameRecord | null {
  let state = createInitialState({
    playerCount: slots.length as 2 | 3 | 4,
    factions: slots.map(s => s.faction) as Faction[],
    gameLength,
  });

  const playerTypes = {} as Record<PlayerId, PlayerType>;
  const botVersions: Partial<Record<PlayerId, string>> = {};
  for (let i = 0; i < slots.length; i++) {
    const pid = (i + 1) as PlayerId;
    playerTypes[pid] = 'bot';
    botVersions[pid] = slots[i].botVersion;
  }

  let steps = 0;
  while (!state.gameOver && steps < MAX_STEPS) {
    const pid = state.activePlayerId;
    if (pid === null) break;
    const botFn = BOT_REGISTRY[slots[pid - 1].botVersion];
    if (!botFn) break;
    const action = botFn(state, pid);
    if (!action) break;
    state = applyAction(state, action);
    steps++;
  }

  if (steps >= MAX_STEPS && !state.gameOver) {
    console.warn(`[simulate] Game timed out after ${MAX_STEPS} steps`);
    return null;
  }

  return buildRecord(state, playerTypes, botVersions);
}

// Runs count games, yields to the event loop every YIELD_EVERY games to keep
// the tab responsive, and appends each record to localStorage as it goes.
export async function runBatch(
  slots: PlayerSlot[],
  gameLength: 'short' | 'standard' | 'extended',
  count: number,
  onProgress: (done: number, total: number) => void
): Promise<GameRecord[]> {
  const records: GameRecord[] = [];
  const YIELD_EVERY = 25;

  for (let i = 0; i < count; i++) {
    const record = runGame(slots, gameLength);
    if (record) {
      records.push(record);
      appendRecord(record);
    }
    onProgress(i + 1, count);
    if ((i + 1) % YIELD_EVERY === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  return records;
}

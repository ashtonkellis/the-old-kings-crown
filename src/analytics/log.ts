import { Faction, PlayerId, GameState } from '../engine/types';

export type PlayerType = 'human' | 'bot';
export type WinCondition = 'influence' | 'favour' | 'order' | 'tie';

export interface PlayerRecord {
  playerId: PlayerId;
  faction: Faction;
  playerType: PlayerType;
  botVersion?: string;
  finalInfluence: number;
  finalLore: number;
  kcCount: number;
  holdsFavour: boolean;
  orderPosition: number;
}

export interface GameRecord {
  id: string;
  timestamp: number;
  gameLength: string;
  rounds: number;
  maxRounds: number;
  players: PlayerRecord[];
  winnerId: PlayerId | null;
  winnerFaction: Faction | null;
  winCondition: WinCondition;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tokc-game-log';

export function loadLog(): GameRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GameRecord[]) : [];
  } catch {
    return [];
  }
}

function saveLog(records: GameRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    console.warn('[tokc] Could not save game log — localStorage full?');
  }
}

export function appendRecord(record: GameRecord): void {
  const records = loadLog();
  records.push(record);
  saveLog(records);
}

export function clearLog(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Build record from final GameState ───────────────────────────────────────

export function buildRecord(
  state: GameState,
  playerTypes: Record<PlayerId, PlayerType>,
  botVersions: Partial<Record<PlayerId, string>>
): GameRecord {
  const winner = state.players.find(p => p.playerId === state.winner);

  // Determine win condition from runner-up comparison
  let winCondition: WinCondition = 'tie';
  if (state.winner !== null && state.players.length > 1) {
    const sorted = [...state.players].sort((a, b) => b.supply.influence - a.supply.influence);
    const best = sorted[0];
    const second = sorted[1];
    if (best.supply.influence > second.supply.influence) {
      winCondition = 'influence';
    } else if (best.holdsFavour) {
      winCondition = 'favour';
    } else {
      winCondition = 'order';
    }
  }

  const players: PlayerRecord[] = state.players.map(p => ({
    playerId: p.playerId,
    faction: p.faction,
    playerType: playerTypes[p.playerId] ?? 'bot',
    botVersion: botVersions[p.playerId],
    finalInfluence: p.supply.influence,
    finalLore: p.supply.lore,
    kcCount: p.kcSlots.filter(slot => slot.kc !== null).length,
    holdsFavour: p.holdsFavour,
    orderPosition: p.orderPosition,
  }));

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    gameLength: 'standard',
    rounds: state.board.round,
    maxRounds: state.board.maxRounds,
    players,
    winnerId: state.winner,
    winnerFaction: winner?.faction ?? null,
    winCondition,
  };
}

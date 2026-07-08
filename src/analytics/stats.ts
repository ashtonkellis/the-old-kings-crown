import { Faction } from '../engine/types';
import { GameRecord, PlayerType, WinCondition } from './log';

export type FactionKey = Faction | 'all';

export interface FactionStats {
  faction: Faction;
  games: number;
  wins: number;
  winRate: number;
  avgInfluence: number;
}

export interface MatchupStats {
  factionA: Faction;
  factionB: Faction;
  aWins: number;
  bWins: number;
  ties: number;
  games: number;
}

export interface OverallStats {
  totalGames: number;
  factions: FactionStats[];
  matchups: MatchupStats[];
  byPlayerType: Record<PlayerType, { games: number; wins: number; winRate: number }>;
  byWinCondition: Record<WinCondition, number>;
  avgRounds: number;
}

export function computeStats(records: GameRecord[]): OverallStats {
  const factionMap = new Map<Faction, { games: number; wins: number; totalInfluence: number }>();
  const matchupMap = new Map<string, MatchupStats>();
  const typeMap: Record<PlayerType, { games: number; wins: number }> = {
    human: { games: 0, wins: 0 },
    bot: { games: 0, wins: 0 },
  };
  const winConditionCounts: Record<WinCondition, number> = {
    influence: 0,
    favour: 0,
    order: 0,
    tie: 0,
  };
  let totalRounds = 0;

  for (const record of records) {
    totalRounds += record.rounds;
    winConditionCounts[record.winCondition]++;

    for (const p of record.players) {
      if (!factionMap.has(p.faction)) {
        factionMap.set(p.faction, { games: 0, wins: 0, totalInfluence: 0 });
      }
      const fstat = factionMap.get(p.faction)!;
      fstat.games++;
      fstat.totalInfluence += p.finalInfluence;
      if (record.winnerId === p.playerId) fstat.wins++;

      typeMap[p.playerType].games++;
      if (record.winnerId === p.playerId) typeMap[p.playerType].wins++;
    }

    // 2-player matchups
    if (record.players.length === 2) {
      const [a, b] = record.players;
      const key = [a.faction, b.faction].sort().join(':');
      if (!matchupMap.has(key)) {
        const [fa, fb] = [a.faction, b.faction].sort() as Faction[];
        matchupMap.set(key, { factionA: fa, factionB: fb, aWins: 0, bWins: 0, ties: 0, games: 0 });
      }
      const mu = matchupMap.get(key)!;
      mu.games++;
      if (record.winnerId === null) {
        mu.ties++;
      } else {
        const winnerFaction = record.winnerFaction!;
        if (winnerFaction === mu.factionA) mu.aWins++;
        else mu.bWins++;
      }
    }
  }

  const factions: FactionStats[] = Array.from(factionMap.entries()).map(([faction, s]) => ({
    faction,
    games: s.games,
    wins: s.wins,
    winRate: s.games > 0 ? s.wins / s.games : 0,
    avgInfluence: s.games > 0 ? s.totalInfluence / s.games : 0,
  }));

  factions.sort((a, b) => b.winRate - a.winRate);

  const byPlayerType: OverallStats['byPlayerType'] = {
    human: { ...typeMap.human, winRate: typeMap.human.games > 0 ? typeMap.human.wins / typeMap.human.games : 0 },
    bot: { ...typeMap.bot, winRate: typeMap.bot.games > 0 ? typeMap.bot.wins / typeMap.bot.games : 0 },
  };

  return {
    totalGames: records.length,
    factions,
    matchups: Array.from(matchupMap.values()).sort((a, b) => b.games - a.games),
    byPlayerType,
    byWinCondition: winConditionCounts,
    avgRounds: records.length > 0 ? totalRounds / records.length : 0,
  };
}

export function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

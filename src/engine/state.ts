import {
  GameState, PlayerState, BoardState, GameConfig,
  CardInstance, KCInstance, KCSlot, SupporterPiece,
  Region, Location, Council, PlayerId, Faction,
} from './types';
import { buildBasicCards, TACTIC_TILES } from './data/factions';
import { KINGDOM_CARDS } from './data/kingdoms';

let _uid = 0;
function nextUid(): string {
  return `uid-${++_uid}`;
}

function makeCardInstance(defId: string): CardInstance {
  return { defId, uid: nextUid(), influenceOnCard: 0 };
}

function makeKCInstance(defId: string): KCInstance {
  return { defId, uid: nextUid() };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeEmptyKCSlot(): KCSlot {
  return { kc: null, occupyingCard: null };
}

const ALL_LOCATIONS: Location[] = [
  'castle', 'wilderness', 'harvest-field', 'battlefield', 'shrine', 'necropolis',
];

function makeEmptyRegion(region: Region) {
  const locations = {} as Record<Location, ReturnType<typeof makeEmptyLocationState>>;
  for (const loc of ALL_LOCATIONS) {
    locations[loc] = makeEmptyLocationState();
  }
  return {
    region,
    clashMarker: null,
    resolved: false,
    activeCards: [],
    supporters: [],
    locations: locations as import('./types').RegionClashState['locations'],
    clashes: [],
    dayActionPending: [] as PlayerId[],
    tiePending: [] as PlayerId[],
  };
}

function makeEmptyLocationState() {
  return {
    heraldOwner: null as PlayerId | null,
    factionMarkers: [] as { playerId: PlayerId; count: number }[],
    hasFavourDisc: false,
  };
}

export function createInitialState(config: GameConfig): GameState {
  const { playerCount, factions, gameLength } = config;

  // Kingdom deck
  const kcInstances = shuffle(KINGDOM_CARDS.map(kc => makeKCInstance(kc.id)));
  const roadSize = 5;
  const greatRoad = kcInstances.slice(0, roadSize) as (KCInstance | null)[];
  const kingdomDeck = kcInstances.slice(roadSize);

  // Councils
  const councils: Record<Council, []> = {
    relics: [],
    secrets: [],
    oaths: [],
  };

  // Map
  const map: Record<Region, ReturnType<typeof makeEmptyRegion>> = {
    highlands: makeEmptyRegion('highlands'),
    plateau: makeEmptyRegion('plateau'),
    lowlands: makeEmptyRegion('lowlands'),
  };

  const maxRounds = gameLength === 'short' ? 3 : gameLength === 'extended' ? 5 : 4;

  const board: BoardState = {
    greatRoad,
    kingdomDeck,
    kingdomDiscard: [],
    reserve: { influence: 30, lore: 30 },
    lostPile: [],
    map,
    councils,
    favourLocation: 'castle',
    round: 1,
    maxRounds,
    phase: 'spring',
    step: 'bid',
    clashOrder: null,
    currentClashIndex: 0,
    actionStepDone: [],
  };

  // Players
  const players: PlayerState[] = [];
  for (let i = 0; i < playerCount; i++) {
    const pid = (i + 1) as PlayerId;
    const faction = factions[i] as Faction;
    const basicDefs = buildBasicCards(faction);
    const deck = shuffle(basicDefs.map(d => makeCardInstance(d.id)));
    // Deal initial hand of 4
    const hand = deck.splice(0, 4);

    const supporters: SupporterPiece[] = Array.from({ length: 5 }, (_, idx) => ({
      id: idx + 1,
      location: 'player-board',
    }));

    const player: PlayerState = {
      playerId: pid,
      faction,
      heirName: basicDefs.find(d => d.isHeir)?.title ?? faction,
      deck,
      hand,
      discardPile: [],
      lostCards: [],
      kcSlots: [makeEmptyKCSlot(), makeEmptyKCSlot()],
      tactics: TACTIC_TILES[faction].map(t => ({ ...t })),
      supporters,
      herald: { location: 'player-board' },
      supply: { influence: 5, lore: 0 },
      handSize: 4,
      siteOfPower: [],
      hqCards: [],
      holdsFavour: false,
      favourUsesLeft: 0,
      factionMarkers: { onBoard: [], inSupply: 10 },
      orderPosition: i,
      bid: null,
      bidResolved: false,
      regionCards: [],
      usedCommands: {},
    };
    players.push(player);
  }

  const orderTrack = players.map(p => p.playerId);

  return {
    board,
    players,
    orderTrack,
    activePlayerId: orderTrack[0],
    playerCount,
    gameOver: false,
    winner: null,
  };
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  const p = state.players.find(p => p.playerId === playerId);
  if (!p) throw new Error(`Player ${playerId} not found`);
  return p;
}

export function mutatePlayer(
  state: GameState,
  playerId: PlayerId,
  fn: (p: PlayerState) => PlayerState
): GameState {
  return {
    ...state,
    players: state.players.map(p => p.playerId === playerId ? fn(p) : p),
  };
}

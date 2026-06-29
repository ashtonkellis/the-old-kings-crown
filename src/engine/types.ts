// ─── Primitives ───────────────────────────────────────────────────────────────

export type PlayerId = 1 | 2 | 3 | 4;
export type Faction = 'nobility' | 'clans' | 'uprising' | 'gathering';
export type Phase = 'start-of-year' | 'spring' | 'summer' | 'autumn' | 'winter';
export type Region = 'highlands' | 'plateau' | 'lowlands';
export type Location = 'castle' | 'wilderness' | 'harvest-field' | 'battlefield' | 'shrine' | 'necropolis';
export type Council = 'relics' | 'secrets' | 'oaths';
export type CardSuit = 'coins' | 'scroll' | 'sword';
export type Archetype = 'agent' | 'captain' | 'cavalry' | 'champion' | 'follower' | 'heir' | 'ruse' | 'trader' | 'war-machine';
export type Trait = 'resilient' | 'invulnerable' | 'pathfinder';
export type CommandType = 'ambush' | 'retreat' | 'flank' | 'rally-self' | 'rally-any' | 'deploy' | 'deadly';
export type ClashMarker = 'I' | 'II' | 'III';

// ─── Card Definitions (static data) ──────────────────────────────────────────

export interface Command {
  type: CommandType;
  value?: number;           // X for rally-any / deploy
  step: 'day' | 'night' | 'autumn';
  optional: boolean;
}

export interface CardDef {
  id: string;
  title: string;
  faction: Faction | 'neutral';
  strength: number;
  archetype: Archetype;
  traits: Trait[];
  commands: Command[];
  loreIcons: number;
  voteIcons: number;
  isHeir: boolean;
  isAdvanced: boolean;
  isHQ: boolean;
  loreCost?: number;
  rulesText?: string;
}

export interface KingdomCardDef {
  id: string;
  title: string;
  suit: CardSuit;
  rulesText: string;
}

// ─── Runtime Instances ────────────────────────────────────────────────────────

export interface CardInstance {
  defId: string;
  uid: string;
  influenceOnCard: number;
}

export interface KCInstance {
  defId: string;
  uid: string;
}

export interface KCSlot {
  kc: KCInstance | null;
  occupyingCard: CardInstance | null;
}

// ─── Player Components ────────────────────────────────────────────────────────

export interface TacticTile {
  id: 1 | 2 | 3 | 4;
  name: string;
  rulesText: string;
  exhausted: boolean;
  markersLeft: number;
}

export interface SupporterPiece {
  id: number;
  location: Region | 'player-board' | 'lost-pile';
}

export interface HeraldPiece {
  location: Location | 'player-board';
}

export interface CouncilEntry {
  playerId: PlayerId;
  card: CardInstance;
}

export interface FactionMarkerPlacement {
  location: Location;
  count: number;
}

// ─── Player State ─────────────────────────────────────────────────────────────

export interface PlayerState {
  playerId: PlayerId;
  faction: Faction;
  heirName: string;

  deck: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  lostCards: CardInstance[];

  kcSlots: [KCSlot, KCSlot];
  tactics: TacticTile[];
  supporters: SupporterPiece[];
  herald: HeraldPiece;

  supply: { influence: number; lore: number };
  handSize: number;

  siteOfPower: CardInstance[];
  hqCards: CardInstance[];

  holdsFavour: boolean;
  favourUsesLeft: number;

  factionMarkers: { onBoard: FactionMarkerPlacement[]; inSupply: number };

  orderPosition: number;

  bid: CardInstance | null;
  bidResolved: boolean;

  regionCards: { region: Region; card: CardInstance; revealed: boolean }[];

  // Tracks which commands each active card has already used this clash
  usedCommands: Record<string, CommandType[]>;
}

// ─── Board / Map State ────────────────────────────────────────────────────────

export interface LocationState {
  heraldOwner: PlayerId | null;
  factionMarkers: { playerId: PlayerId; count: number }[];
  hasFavourDisc: boolean;
}

export interface ClashResult {
  winnerId: PlayerId | null;
  strengths: { playerId: PlayerId; total: number }[];
  tiebroken: boolean;
}

export interface RegionClashState {
  region: Region;
  clashMarker: ClashMarker | null;
  resolved: boolean;
  activeCards: { playerId: PlayerId; card: CardInstance; faceDown: boolean }[];
  supporters: { playerId: PlayerId; count: number }[];
  locations: Record<Location, LocationState>;
  clashes: ClashResult[];
  // Players yet to act in the current Day Action Step for this region
  dayActionPending: PlayerId[];
  // For tied clash resolution: players in the tie who haven't responded
  tiePending: PlayerId[];
}

export type LostEntry = CardInstance | { type: 'supporter'; playerId: PlayerId; supporterId: number };

export interface BoardState {
  greatRoad: (KCInstance | null)[];
  kingdomDeck: KCInstance[];
  kingdomDiscard: KCInstance[];

  reserve: { influence: number; lore: number };
  lostPile: LostEntry[];

  map: Record<Region, RegionClashState>;
  councils: Record<Council, CouncilEntry[]>;

  favourLocation: Location | PlayerId;

  round: number;
  maxRounds: number;
  phase: Phase;
  step: string;

  clashOrder: Region[] | null;
  currentClashIndex: number;

  actionStepDone: PlayerId[];
}

// ─── Top-level Game State ─────────────────────────────────────────────────────

export interface GameState {
  board: BoardState;
  players: PlayerState[];
  orderTrack: PlayerId[];
  activePlayerId: PlayerId | null;
  playerCount: 2 | 3 | 4;
  gameOver: boolean;
  winner: PlayerId | null;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  | { type: 'INIT_GAME'; config: GameConfig }
  // Spring
  | { type: 'PLACE_BID'; playerId: PlayerId; cardUid: string }
  | { type: 'RESOLVE_BID_TAKE_KC'; playerId: PlayerId; roadSlot: number }
  | { type: 'RESOLVE_BID_STEAL_KC'; playerId: PlayerId; targetPlayerId: PlayerId; targetSlot: 0 | 1 }
  | { type: 'RESOLVE_BID_RETURN'; playerId: PlayerId }
  | { type: 'PLACE_HERALD'; playerId: PlayerId; location: Location }
  | { type: 'PLACE_REGION_CARD'; playerId: PlayerId; region: Region; cardUid: string }
  | { type: 'PLACE_SUPPORTERS'; playerId: PlayerId; placements: { region: Region; count: number }[] }
  // Summer
  | { type: 'SET_CLASH_ORDER'; playerId: PlayerId; order: [Region, Region, Region] }
  | { type: 'ACTIVATE_AMBUSH'; playerId: PlayerId; region: Region; sourceCardUid: string; ambushCardUid: string }
  | { type: 'ACTIVATE_RETREAT'; playerId: PlayerId; region: Region; cardUids: string[]; retreatHerald: boolean }
  | { type: 'ACTIVATE_FLANK'; playerId: PlayerId; cardUid: string; fromRegion: Region; toRegion: Region }
  | { type: 'CLAIM_REWARDS'; playerId: PlayerId; region: Region; chosenLocation: Location }
  | { type: 'TIED_CLASH_PLAY'; playerId: PlayerId; region: Region; cardUid: string }
  | { type: 'TIED_CLASH_PASS'; playerId: PlayerId; region: Region }
  // Autumn
  | { type: 'GOVERN'; playerId: PlayerId; cardUid: string; council: Council }
  | { type: 'JOURNEY'; playerId: PlayerId; cardUid: string }
  | { type: 'SPEND_LORE'; playerId: PlayerId; siteCardUid: string }
  | { type: 'ACTIVATE_RALLY'; playerId: PlayerId; cardUids: string[] }
  | { type: 'ACTIVATE_DEPLOY'; playerId: PlayerId; cardUid: string; region: Region }
  // Universal
  | { type: 'PASS_ACTION'; playerId: PlayerId }
  | { type: 'END_TURN'; playerId: PlayerId };

export interface GameConfig {
  playerCount: 2 | 3 | 4;
  factions: Faction[];
  gameLength: 'short' | 'standard' | 'extended';
}

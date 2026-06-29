import { KingdomCardDef } from '../types';

export const KINGDOM_CARDS: KingdomCardDef[] = [
  // ── Coins (17) ──────────────────────────────────────────────────────────────
  { id: 'kc-coins-01', title: 'The Iron Treasury',      suit: 'coins', rulesText: 'Occupier: At the end of the Round, gain 1 Influence.' },
  { id: 'kc-coins-02', title: 'The Grand Market',        suit: 'coins', rulesText: 'Occupier: At the end of the Round, gain 2 Influence.' },
  { id: 'kc-coins-03', title: 'Coin Vault',              suit: 'coins', rulesText: 'Occupier: At the end of the Round, gain 1 Influence per empty Kingdom Card Slot on the Great Road.' },
  { id: 'kc-coins-04', title: 'The Merchant Guild',      suit: 'coins', rulesText: 'Occupier: Whenever another player gains Influence from a Kingdom Card, gain 1 Influence.' },
  { id: 'kc-coins-05', title: 'The Toll Road',           suit: 'coins', rulesText: 'Occupier: Whenever any player (including you) claims a Kingdom Card this Round, gain 1 Influence.' },
  { id: 'kc-coins-06', title: 'The Trading Post',        suit: 'coins', rulesText: 'Occupier: Once per Spring, gain 1 Lore and 1 Influence.' },
  { id: 'kc-coins-07', title: 'The Armory',              suit: 'coins', rulesText: 'Occupier: For the rest of the Round, all your Active cards gain +1 Strength.' },
  { id: 'kc-coins-08', title: 'The Stable',              suit: 'coins', rulesText: 'Occupier: For the rest of the Round, all your ♞ cards gain +2 Strength.' },
  { id: 'kc-coins-09', title: 'The Royal Vault',         suit: 'coins', rulesText: 'Occupier: Gain 1 Influence for each of your cards currently in the Lost Pile (max 4).' },
  { id: 'kc-coins-10', title: 'The Apothecary',          suit: 'coins', rulesText: 'Occupier: Once this Round, when one of your cards is Eliminated, return it to your Discard Pile instead.' },
  { id: 'kc-coins-11', title: 'The Caravan',             suit: 'coins', rulesText: 'Occupier: At the end of the Round, you may move up to 2 Supporters between any Regions.' },
  { id: 'kc-coins-12', title: 'The Bazaar',              suit: 'coins', rulesText: 'Occupier: Gain 1 Influence and 1 Lore.' },
  { id: 'kc-coins-13', title: 'The Granary',             suit: 'coins', rulesText: 'Occupier: At the start of Winter, gain 1 Influence for each Region where you have at least 1 Supporter.' },
  { id: 'kc-coins-14', title: 'The Foundry',             suit: 'coins', rulesText: 'Occupier: Gain 3 Influence. Lose 2 Influence at the end of Winter.' },
  { id: 'kc-coins-15', title: 'The Tax Collector',       suit: 'coins', rulesText: 'Occupier: At the end of the Round, for each other player who gained more Influence than you this Round, gain 1 Influence.' },
  { id: 'kc-coins-16', title: 'The Old Money',           suit: 'coins', rulesText: 'Occupier: At the end of the game, gain 2 Influence.' },
  { id: 'kc-coins-17', title: 'The Investment',          suit: 'coins', rulesText: 'Occupier: Immediately gain 1 Influence. At the end of the game, gain 2 additional Influence.' },

  // ── Scroll (17) ─────────────────────────────────────────────────────────────
  { id: 'kc-scroll-01', title: 'The Ancient Archive',    suit: 'scroll', rulesText: 'Occupier: Gain 2 Lore.' },
  { id: 'kc-scroll-02', title: 'The Scriptorium',        suit: 'scroll', rulesText: 'Occupier: At the end of the Round, gain 1 Lore for each Council Seat you control.' },
  { id: 'kc-scroll-03', title: 'The Astrologer',         suit: 'scroll', rulesText: 'Occupier: Look at the top 3 cards of the Kingdom Deck. Return them in any order.' },
  { id: 'kc-scroll-04', title: 'The Wise Fool',          suit: 'scroll', rulesText: 'Occupier: Draw 2 cards. Choose 1 to keep; place the other in the Kingdom Discard.' },
  { id: 'kc-scroll-05', title: 'The Hall of Records',    suit: 'scroll', rulesText: 'Occupier: Once this Round, when you Govern, pay 1 fewer Lore.' },
  { id: 'kc-scroll-06', title: 'The Observatory',        suit: 'scroll', rulesText: 'Occupier: During Summer, you know the face-down cards in one Region of your choice.' },
  { id: 'kc-scroll-07', title: 'The Library',            suit: 'scroll', rulesText: 'Occupier: Gain 1 Lore for each card you send to the Lost Pile this Round (max 3).' },
  { id: 'kc-scroll-08', title: 'The Academy',            suit: 'scroll', rulesText: 'Occupier: Once this Round, you may look at all face-down cards in one Region.' },
  { id: 'kc-scroll-09', title: 'The Cartographer',       suit: 'scroll', rulesText: 'Occupier: Choose a Region. Until end of Round, all your cards in that Region gain +1 Strength.' },
  { id: 'kc-scroll-10', title: 'The Oracle',             suit: 'scroll', rulesText: 'Occupier: Look at one opponent\'s Hand.' },
  { id: 'kc-scroll-11', title: 'The Secret Library',     suit: 'scroll', rulesText: 'Occupier: Gain 1 Lore for each Advanced Card in your Site of Power.' },
  { id: 'kc-scroll-12', title: 'The Truth Seeker',       suit: 'scroll', rulesText: 'Occupier: At the end of Autumn, if you controlled the most Council Seats, gain 2 Influence.' },
  { id: 'kc-scroll-13', title: 'The Lore Keeper',        suit: 'scroll', rulesText: 'Occupier: Move up to 2 cards from your Discard Pile to your Hand.' },
  { id: 'kc-scroll-14', title: 'The Scholar',            suit: 'scroll', rulesText: 'Occupier: Gain 1 Lore for each ♦ icon on cards currently in your Site of Power.' },
  { id: 'kc-scroll-15', title: 'The Prophecy',           suit: 'scroll', rulesText: 'Occupier: Choose a card in your Hand. That card gains +2 Strength this Round.' },
  { id: 'kc-scroll-16', title: 'The Rune Stone',         suit: 'scroll', rulesText: 'Occupier: Gain 3 Lore.' },
  { id: 'kc-scroll-17', title: 'The Tome of Kings',      suit: 'scroll', rulesText: 'Occupier: At the end of the game, gain 1 Influence for each Lore you have (max 5).' },

  // ── Sword (17) ──────────────────────────────────────────────────────────────
  { id: 'kc-sword-01',  title: 'The War Camp',           suit: 'sword', rulesText: 'Occupier: Gain 1 Supporter from your Player Board and place it in this Region.' },
  { id: 'kc-sword-02',  title: 'The Fortress',           suit: 'sword', rulesText: 'Occupier: For the rest of the Round, your cards in this Region cannot be Flanked.' },
  { id: 'kc-sword-03',  title: 'The Garrison',           suit: 'sword', rulesText: 'Occupier: Place 1 Faction Marker here. That marker is not removed during Winter Cleanup.' },
  { id: 'kc-sword-04',  title: 'The Watchtower',         suit: 'sword', rulesText: 'Occupier: During Summer, before any Clash in this Region, you may reveal one opponent\'s face-down card.' },
  { id: 'kc-sword-05',  title: 'The Siege Works',        suit: 'sword', rulesText: 'Occupier: Choose one opponent. One of their Active cards in this Region loses 2 Strength this Round.' },
  { id: 'kc-sword-06',  title: 'The Battle Standard',    suit: 'sword', rulesText: 'Occupier: Your cards in this Region gain +1 Strength for each Clash Marker on this Region.' },
  { id: 'kc-sword-07',  title: 'The Proving Grounds',    suit: 'sword', rulesText: 'Occupier: Choose a card in this Region. That card gains +1 Strength this Round.' },
  { id: 'kc-sword-08',  title: 'The Fallen Banner',      suit: 'sword', rulesText: 'Occupier: At the end of a Clash in this Region, if you won, gain 1 Influence.' },
  { id: 'kc-sword-09',  title: 'The Warmonger',          suit: 'sword', rulesText: 'Occupier: At the end of a Clash you win, Eliminate one Supporter from this Region (your choice of player).' },
  { id: 'kc-sword-10',  title: 'The Champion\'s Arena',  suit: 'sword', rulesText: 'Occupier: At the start of Summer, gain 1 Influence for each Clash Marker across all Regions.' },
  { id: 'kc-sword-11',  title: 'The Night Patrol',       suit: 'sword', rulesText: 'Occupier: During Summer Night, Eliminate one Supporter in this Region (your choice of player\'s).' },
  { id: 'kc-sword-12',  title: 'The War Road',           suit: 'sword', rulesText: 'Occupier: You may move one of your Active cards from any other Region to this Region (facedown).' },
  { id: 'kc-sword-13',  title: 'The Iron Palisade',      suit: 'sword', rulesText: 'Occupier: Your Supporters in this Region cannot be Eliminated this Round.' },
  { id: 'kc-sword-14',  title: 'The Rebel Stronghold',   suit: 'sword', rulesText: 'Occupier: Choose one opponent. Negate one of their card\'s Commands this Round in this Region.' },
  { id: 'kc-sword-15',  title: 'The Crown\'s Armoury',   suit: 'sword', rulesText: 'Occupier: Gain 2 Influence. One opponent of your choice loses 1 Influence.' },
  { id: 'kc-sword-16',  title: 'The Mercenary Post',     suit: 'sword', rulesText: 'Occupier: Move up to 2 Supporters from your Player Board to any Region.' },
  { id: 'kc-sword-17',  title: 'The Last Bastion',       suit: 'sword', rulesText: 'Occupier: At the end of the game, if you are the Sole Occupier of at least 2 Locations, gain 3 Influence.' },
];

const _kcMap: Map<string, KingdomCardDef> = new Map(
  KINGDOM_CARDS.map(kc => [kc.id, kc])
);

export function getKingdomCardDef(id: string): KingdomCardDef {
  const def = _kcMap.get(id);
  if (!def) throw new Error(`Unknown KC def: ${id}`);
  return def;
}

// ============================================================
// shared/gameLogic.ts — Core 500 game logic (server-side only)
// Used by all Edge Functions
// ============================================================

// Card format: "SUIT-RANK" e.g. "H-A", "S-J", "D-10", "JOKER-R"
// Suits: H=Hearts, D=Diamonds, C=Clubs, S=Spades
// Ranks: 4,5,6,7,8,9,10,J,Q,K,A, R=Red Joker

export type Suit = 'H' | 'D' | 'C' | 'S';
export type Trump = 'hearts' | 'diamonds' | 'clubs' | 'spades' | 'no_trump' | 'nullo' | 'open_nullo';

export interface Card {
  suit: Suit | 'JOKER';
  rank: string;
  raw: string; // original string
}

export function parseCard(raw: string): Card {
  if (raw === 'JOKER-R') return { suit: 'JOKER', rank: 'R', raw };
  const [suit, rank] = raw.split('-');
  return { suit: suit as Suit, rank, raw };
}

// ============================================================
// DECK GENERATION
// ============================================================
export function generateDeck(): string[] {
  const deck: string[] = [];
  const suits: Suit[] = ['H', 'D', 'C', 'S'];
  const allRanks = ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  // Hearts and Diamonds: 4 through Ace (11 cards)
  // Clubs and Spades: 5 through Ace (10 cards)
  for (const suit of suits) {
    const ranks = (suit === 'C' || suit === 'S')
      ? allRanks.filter(r => r !== '4')
      : allRanks;
    for (const rank of ranks) {
      deck.push(`${suit}-${rank}`);
    }
  }
  deck.push('JOKER-R');
  // 11 + 11 + 10 + 10 + 1 = 43 cards
  return deck;
}

// Cryptographically secure Fisher-Yates shuffle using crypto.getRandomValues
export function secureShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealCards(deck: string[]): { hands: string[][], kitty: string[] } {
  const shuffled = secureShuffle(deck);
  return {
    hands: [
      shuffled.slice(0, 10),
      shuffled.slice(10, 20),
      shuffled.slice(20, 30),
      shuffled.slice(30, 40),
    ],
    kitty: shuffled.slice(40, 43),
  };
}

// ============================================================
// TRUMP / SUIT LOGIC
// ============================================================

// Get the trump suit letter from trump enum
export function trumpToSuit(trump: Trump): Suit | null {
  switch (trump) {
    case 'hearts': return 'H';
    case 'diamonds': return 'D';
    case 'clubs': return 'C';
    case 'spades': return 'S';
    default: return null;
  }
}

// Get the "other" suit of same color (for left bower)
export function sameColorSuit(suit: Suit): Suit {
  switch (suit) {
    case 'H': return 'D';
    case 'D': return 'H';
    case 'C': return 'S';
    case 'S': return 'C';
  }
}

// Is this card the Joker?
export function isJoker(card: Card): boolean {
  return card.suit === 'JOKER';
}

// Is this card the Right Bower (Jack of trump suit)?
export function isRightBower(card: Card, trump: Trump): boolean {
  const ts = trumpToSuit(trump);
  return ts !== null && card.rank === 'J' && card.suit === ts;
}

// Is this card the Left Bower (Jack of same-color suit)?
export function isLeftBower(card: Card, trump: Trump): boolean {
  const ts = trumpToSuit(trump);
  return ts !== null && card.rank === 'J' && card.suit === sameColorSuit(ts);
}

// What is the effective suit of a card given trump?
export function effectiveSuit(card: Card, trump: Trump): string {
  if (isJoker(card)) return trumpToSuit(trump) ?? 'JOKER';
  if (isLeftBower(card, trump)) return trumpToSuit(trump) ?? card.suit;
  return card.suit;
}

// Is this card a trump card?
export function isTrump(card: Card, trump: Trump): boolean {
  const ts = trumpToSuit(trump);
  if (!ts) return false;
  if (isJoker(card)) return true;
  if (isRightBower(card, trump)) return true;
  if (isLeftBower(card, trump)) return true;
  return card.suit === ts;
}

// ============================================================
// CARD RANKING
// ============================================================
const RANK_ORDER: Record<string, number> = {
  '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// Get trump rank (higher = better)
export function trumpRank(card: Card, trump: Trump): number {
  if (isJoker(card)) return 100; // highest
  if (isRightBower(card, trump)) return 50;
  if (isLeftBower(card, trump)) return 49;
  return RANK_ORDER[card.rank] ?? 0;
}

// No-trump rank: Joker is still highest, no bowers
export function noTrumpRank(card: Card): number {
  if (isJoker(card)) return 100;
  return RANK_ORDER[card.rank] ?? 0;
}

// ============================================================
// TRICK RESOLUTION
// ============================================================
export interface PlayedCard {
  seat: number;
  card: Card;
}

export function resolveTrick(plays: PlayedCard[], trump: Trump, ledSuit: string): number {
  // Returns the seat number of the trick winner
  let winner = plays[0];

  for (let i = 1; i < plays.length; i++) {
    const challenger = plays[i];
    if (beats(challenger.card, winner.card, trump, ledSuit)) {
      winner = challenger;
    }
  }

  return winner.seat;
}

function beats(challenger: Card, current: Card, trump: Trump, ledSuit: string): boolean {
  const isTrumpMode = trump !== 'no_trump' && trump !== 'nullo' && trump !== 'open_nullo';

  if (isTrumpMode) {
    const cIsTrump = isTrump(challenger, trump);
    const wIsTrump = isTrump(current, trump);

    if (cIsTrump && !wIsTrump) return true;
    if (!cIsTrump && wIsTrump) return false;

    if (cIsTrump && wIsTrump) {
      return trumpRank(challenger, trump) > trumpRank(current, trump);
    }
    // Both non-trump: challenger only wins if same led suit AND higher rank
    if (effectiveSuit(challenger, trump) === ledSuit) {
      if (effectiveSuit(current, trump) !== ledSuit) return true;
      return noTrumpRank(challenger) > noTrumpRank(current);
    }
    return false;
  } else {
    // No trump / nullo: Joker still wins, then led suit, then rank
    if (isJoker(challenger)) return true;
    if (isJoker(current)) return false;
    if (challenger.suit === ledSuit && current.suit !== ledSuit) return true;
    if (challenger.suit !== ledSuit) return false;
    return noTrumpRank(challenger) > noTrumpRank(current);
  }
}

// ============================================================
// LEGAL PLAYS
// ============================================================
export function getLegalPlays(
  hand: string[],
  trump: Trump,
  ledSuit: string | null,
  isFirstPlay: boolean
): string[] {
  if (isFirstPlay || !ledSuit) return hand; // Leader can play anything

  const cards = hand.map(parseCard);
  const ledCards = cards.filter(c => effectiveSuit(c, trump) === ledSuit);

  if (ledCards.length > 0) {
    return ledCards.map(c => c.raw);
  }
  return hand; // Can't follow suit, play anything
}

// ============================================================
// BID VALIDATION
// ============================================================
export interface Bid {
  type: 'pass' | 'suit' | 'no_trump' | 'nullo' | 'open_nullo';
  tricks?: number; // 6-10
  suit?: Trump;
}

export const BID_VALUES: Record<string, Record<number, number>> = {
  spades:   { 6: 40,  7: 140, 8: 240, 9: 340, 10: 440 },
  clubs:    { 6: 60,  7: 160, 8: 260, 9: 360, 10: 460 },
  diamonds: { 6: 80,  7: 180, 8: 280, 9: 380, 10: 480 },
  hearts:   { 6: 100, 7: 200, 8: 300, 9: 400, 10: 500 },
  no_trump: { 6: 120, 7: 220, 8: 320, 9: 420, 10: 520 },
};

export const NULLO_VALUE = 250;
export const OPEN_NULLO_VALUE = 500;

export function getBidValue(bid: Bid): number {
  if (bid.type === 'pass') return 0;
  if (bid.type === 'nullo') return NULLO_VALUE;
  if (bid.type === 'open_nullo') return OPEN_NULLO_VALUE;
  if (bid.type === 'no_trump' && bid.tricks) return BID_VALUES['no_trump'][bid.tricks];
  if (bid.type === 'suit' && bid.suit && bid.tricks) return BID_VALUES[bid.suit][bid.tricks];
  return 0;
}

export function isValidBid(newBid: Bid, currentHighest: number): boolean {
  if (newBid.type === 'pass') return true;
  const value = getBidValue(newBid);
  return value > currentHighest;
}

// ============================================================
// SCORING
// ============================================================
export interface RoundResult {
  contractorTeam: 0 | 1;
  contractorSeat: number;
  contractTricks: number;
  contractValue: number;
  trump: Trump;
  team0Tricks: number;
  team1Tricks: number;
  isNullo: boolean;
  isOpenNullo: boolean;
}

export function calculateRoundScore(result: RoundResult): { team0Delta: number; team1Delta: number } {
  const { contractorTeam, contractTricks, contractValue, team0Tricks, team1Tricks, isNullo, isOpenNullo } = result;
  const contractorTricks = contractorTeam === 0 ? team0Tricks : team1Tricks;
  const defenderTricks = contractorTeam === 0 ? team1Tricks : team0Tricks;

  let contractorDelta = 0;
  let defenderDelta = 0;

  if (isNullo || isOpenNullo) {
    // Nullo: contractor must win 0 tricks
    if (contractorTricks === 0) {
      contractorDelta = contractValue; // success
    } else {
      contractorDelta = -contractValue; // failure
    }
    defenderDelta = defenderTricks * 10; // defenders still score per trick
  } else {
    if (contractorTricks >= contractTricks) {
      contractorDelta = contractValue; // made contract
    } else {
      contractorDelta = -contractValue; // set
    }
    defenderDelta = defenderTricks * 10;
  }

  if (contractorTeam === 0) {
    return { team0Delta: contractorDelta, team1Delta: defenderDelta };
  } else {
    return { team0Delta: defenderDelta, team1Delta: contractorDelta };
  }
}

export function checkGameOver(team0Score: number, team1Score: number): { over: boolean; winner?: 0 | 1 } {
  if (team0Score >= 500) return { over: true, winner: 0 };
  if (team1Score >= 500) return { over: true, winner: 1 };
  if (team0Score <= -500) return { over: true, winner: 1 };
  if (team1Score <= -500) return { over: true, winner: 0 };
  return { over: false };
}

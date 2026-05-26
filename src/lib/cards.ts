// src/lib/cards.ts — Client-side card utilities (display only, no game logic)

import { TrumpSuit } from './supabase';

export interface ParsedCard {
  suit: string;
  rank: string;
  raw: string;
  isJoker: boolean;
}

export function parseCard(raw: string): ParsedCard {
  if (raw === 'JOKER-R') return { suit: 'JOKER', rank: 'R', raw, isJoker: true };
  const [suit, rank] = raw.split('-');
  return { suit, rank, raw, isJoker: false };
}

export const SUIT_SYMBOLS: Record<string, string> = {
  H: '♥', D: '♦', C: '♣', S: '♠', JOKER: '🃏',
};

export const SUIT_COLORS: Record<string, string> = {
  H: '#e53e3e', D: '#e53e3e', C: '#1a1a2e', S: '#1a1a2e', JOKER: '#9333ea',
};

export const SUIT_NAMES: Record<string, string> = {
  H: 'Hearts', D: 'Diamonds', C: 'Clubs', S: 'Spades', JOKER: 'Joker',
};

export const TRUMP_DISPLAY: Record<TrumpSuit, string> = {
  hearts: '♥ Hearts',
  diamonds: '♦ Diamonds',
  clubs: '♣ Clubs',
  spades: '♠ Spades',
  no_trump: 'No Trump',
  nullo: 'Nullo',
  open_nullo: 'Open Nullo',
};

export const TRUMP_COLOR: Record<TrumpSuit, string> = {
  hearts: '#e53e3e',
  diamonds: '#e53e3e',
  clubs: '#4ade80',
  spades: '#4ade80',
  no_trump: '#60a5fa',
  nullo: '#c084fc',
  open_nullo: '#f472b6',
};

export function getCardDisplay(raw: string): { symbol: string; rank: string; color: string } {
  const card = parseCard(raw);
  if (card.isJoker) return { symbol: '🃏', rank: 'Joker', color: '#9333ea' };
  return {
    symbol: SUIT_SYMBOLS[card.suit] ?? '?',
    rank: card.rank,
    color: SUIT_COLORS[card.suit] ?? '#000',
  };
}

export const BID_TABLE: Array<{
  type: 'suit' | 'no_trump' | 'nullo' | 'open_nullo';
  tricks?: number;
  suit?: TrumpSuit;
  value: number;
  label: string;
}> = [
  // 6 bids
  { type: 'suit', tricks: 6, suit: 'spades',   value: 40,  label: '6♠' },
  { type: 'suit', tricks: 6, suit: 'clubs',    value: 60,  label: '6♣' },
  { type: 'suit', tricks: 6, suit: 'diamonds', value: 80,  label: '6♦' },
  { type: 'suit', tricks: 6, suit: 'hearts',   value: 100, label: '6♥' },
  { type: 'no_trump', tricks: 6,               value: 120, label: '6NT' },
  // 7 bids
  { type: 'suit', tricks: 7, suit: 'spades',   value: 140, label: '7♠' },
  { type: 'suit', tricks: 7, suit: 'clubs',    value: 160, label: '7♣' },
  { type: 'suit', tricks: 7, suit: 'diamonds', value: 180, label: '7♦' },
  { type: 'suit', tricks: 7, suit: 'hearts',   value: 200, label: '7♥' },
  { type: 'no_trump', tricks: 7,               value: 220, label: '7NT' },
  // 8 bids
  { type: 'suit', tricks: 8, suit: 'spades',   value: 240, label: '8♠' },
  { type: 'suit', tricks: 8, suit: 'clubs',    value: 260, label: '8♣' },
  { type: 'suit', tricks: 8, suit: 'diamonds', value: 280, label: '8♦' },
  { type: 'suit', tricks: 8, suit: 'hearts',   value: 300, label: '8♥' },
  { type: 'no_trump', tricks: 8,               value: 320, label: '8NT' },
  // 9 bids
  { type: 'suit', tricks: 9, suit: 'spades',   value: 340, label: '9♠' },
  { type: 'suit', tricks: 9, suit: 'clubs',    value: 360, label: '9♣' },
  { type: 'suit', tricks: 9, suit: 'diamonds', value: 380, label: '9♦' },
  { type: 'suit', tricks: 9, suit: 'hearts',   value: 400, label: '9♥' },
  { type: 'no_trump', tricks: 9,               value: 420, label: '9NT' },
  // 10 bids
  { type: 'suit', tricks: 10, suit: 'spades',  value: 440, label: '10♠' },
  { type: 'suit', tricks: 10, suit: 'clubs',   value: 460, label: '10♣' },
  { type: 'suit', tricks: 10, suit: 'diamonds',value: 480, label: '10♦' },
  { type: 'suit', tricks: 10, suit: 'hearts',  value: 500, label: '10♥' },
  { type: 'no_trump', tricks: 10,              value: 520, label: '10NT' },
  // Special
  { type: 'nullo',               value: 250, label: 'Nullo' },
  { type: 'open_nullo',          value: 500, label: 'Open Nullo' },
];

export const SEAT_POSITIONS = ['bottom', 'left', 'top', 'right'] as const;
export type SeatPosition = typeof SEAT_POSITIONS[number];

export function getSeatPosition(mySeat: number, targetSeat: number): SeatPosition {
  const offset = (targetSeat - mySeat + 4) % 4;
  return SEAT_POSITIONS[offset];
}

// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env and fill in values.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type GamePhase =
  | 'lobby' | 'dealing' | 'bidding' | 'kitty_exchange'
  | 'trick_play' | 'round_scoring' | 'game_over';

export type TrumpSuit =
  | 'spades' | 'clubs' | 'diamonds' | 'hearts'
  | 'no_trump' | 'nullo' | 'open_nullo';

export interface Profile {
  id: string;
  display_name: string;
  games_played: number;
  games_won: number;
}

export interface Game {
  id: string;
  room_code: string;
  phase: GamePhase;
  dealer_seat: number | null;
  current_turn_seat: number | null;
  trump: TrumpSuit | null;
  contract_bid_value: number | null;
  contract_bid_tricks: number | null;
  contract_bidder_seat: number | null;
  team_0_score: number;
  team_1_score: number;
  team_0_tricks_this_round: number;
  team_1_tricks_this_round: number;
  current_round: number;
  current_trick: number;
  host_id: string;
  winner_team: number | null;
  created_at: string;
  updated_at: string;
}

export interface GamePlayer {
  id: string;
  game_id: string;
  player_id: string;
  seat: number;
  is_connected: boolean;
  last_seen: string;
  profile?: Profile;
}

export interface Round {
  id: string;
  game_id: string;
  round_number: number;
  dealer_seat: number;
  kitty_cards: string[];
  kitty_revealed: boolean;
  bid_winner_seat: number | null;
  contract_tricks: number | null;
  contract_trump: TrumpSuit | null;
  contract_value: number | null;
  team_0_tricks: number;
  team_1_tricks: number;
  team_0_score_delta: number | null;
  team_1_score_delta: number | null;
}

export interface Bid {
  id: string;
  game_id: string;
  round_id: string;
  player_id: string;
  seat: number;
  bid_type: 'pass' | 'suit' | 'no_trump' | 'nullo' | 'open_nullo';
  tricks: number | null;
  suit: TrumpSuit | null;
  bid_value: number | null;
  bid_order: number;
  created_at: string;
}

export interface Trick {
  id: string;
  game_id: string;
  round_id: string;
  trick_number: number;
  led_seat: number;
  winner_seat: number | null;
  led_suit: string | null;
  trick_cards?: TrickCard[];
}

export interface TrickCard {
  id: string;
  trick_id: string;
  player_id: string;
  seat: number;
  card: string;
  play_order: number;
}

export interface Hand {
  id: string;
  game_id: string;
  round_id: string;
  player_id: string;
  seat: number;
  cards: string[];
}

export interface GameEvent {
  id: string;
  game_id: string;
  event_type: string;
  player_id: string | null;
  seat: number | null;
  payload: Record<string, any>;
  created_at: string;
}

// ============================================================
// EDGE FUNCTION HELPERS
// ============================================================

export async function callEdgeFunction(name: string, body: Record<string, any>) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Edge function error');
  return data;
}

-- ============================================================
-- 500 Card Game - Complete Database Schema
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 20),
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GAMES
-- ============================================================
CREATE TYPE game_phase AS ENUM (
  'lobby', 'dealing', 'bidding', 'kitty_exchange',
  'trick_play', 'round_scoring', 'game_over'
);

CREATE TYPE trump_suit AS ENUM ('spades', 'clubs', 'diamonds', 'hearts', 'no_trump', 'nullo', 'open_nullo');

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL DEFAULT upper(substring(gen_random_uuid()::text, 1, 6)),
  phase game_phase NOT NULL DEFAULT 'lobby',
  dealer_seat INTEGER CHECK (dealer_seat BETWEEN 0 AND 3),
  current_turn_seat INTEGER CHECK (current_turn_seat BETWEEN 0 AND 3),
  trump trump_suit,
  contract_bid_value INTEGER,
  contract_bid_tricks INTEGER,
  contract_bidder_seat INTEGER,
  team_0_score INTEGER NOT NULL DEFAULT 0, -- seats 0,2
  team_1_score INTEGER NOT NULL DEFAULT 0, -- seats 1,3
  team_0_tricks_this_round INTEGER NOT NULL DEFAULT 0,
  team_1_tricks_this_round INTEGER NOT NULL DEFAULT 0,
  current_round INTEGER NOT NULL DEFAULT 0,
  current_trick INTEGER NOT NULL DEFAULT 0,
  host_id UUID REFERENCES profiles(id),
  winner_team INTEGER, -- 0 or 1
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_games_room_code ON games(room_code);
CREATE INDEX idx_games_phase ON games(phase);

-- ============================================================
-- GAME PLAYERS
-- ============================================================
CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id),
  seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3),
  is_connected BOOLEAN DEFAULT TRUE,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, player_id),
  UNIQUE(game_id, seat)
);

CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_players_player_id ON game_players(player_id);

-- ============================================================
-- ROUNDS
-- ============================================================
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  dealer_seat INTEGER NOT NULL,
  kitty_cards TEXT[] NOT NULL DEFAULT '{}', -- stored as card strings e.g. 'H-A','D-K'
  kitty_revealed BOOLEAN DEFAULT FALSE,
  bid_winner_seat INTEGER,
  contract_tricks INTEGER,
  contract_trump trump_suit,
  contract_value INTEGER,
  team_0_tricks INTEGER DEFAULT 0,
  team_1_tricks INTEGER DEFAULT 0,
  team_0_score_delta INTEGER,
  team_1_score_delta INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_id, round_number)
);

CREATE INDEX idx_rounds_game_id ON rounds(game_id);

-- ============================================================
-- HANDS (private per player - protected by RLS)
-- ============================================================
CREATE TABLE hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id),
  seat INTEGER NOT NULL,
  cards TEXT[] NOT NULL DEFAULT '{}', -- remaining cards in hand
  original_cards TEXT[] NOT NULL DEFAULT '{}', -- dealt cards (for history)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, player_id)
);

CREATE INDEX idx_hands_game_id ON hands(game_id);
CREATE INDEX idx_hands_player_id ON hands(player_id);
CREATE INDEX idx_hands_round_id ON hands(round_id);

-- ============================================================
-- BIDS
-- ============================================================
CREATE TYPE bid_type AS ENUM ('pass', 'suit', 'no_trump', 'nullo', 'open_nullo');

CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id),
  seat INTEGER NOT NULL,
  bid_type bid_type NOT NULL,
  tricks INTEGER, -- 6-10, null for pass/nullo
  suit trump_suit, -- null for pass
  bid_value INTEGER, -- computed numeric value
  bid_order INTEGER NOT NULL, -- sequence within round
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bids_round_id ON bids(round_id);
CREATE INDEX idx_bids_game_id ON bids(game_id);

-- ============================================================
-- TRICKS
-- ============================================================
CREATE TABLE tricks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  trick_number INTEGER NOT NULL,
  led_seat INTEGER NOT NULL,
  winner_seat INTEGER, -- set when trick complete
  led_suit TEXT, -- actual suit led (considering trump/bower rules)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, trick_number)
);

CREATE INDEX idx_tricks_round_id ON tricks(round_id);
CREATE INDEX idx_tricks_game_id ON tricks(game_id);

-- ============================================================
-- TRICK CARDS
-- ============================================================
CREATE TABLE trick_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  trick_id UUID NOT NULL REFERENCES tricks(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id),
  seat INTEGER NOT NULL,
  card TEXT NOT NULL, -- e.g. 'H-A', 'S-J', 'JOKER-R'
  play_order INTEGER NOT NULL, -- 0-3 within trick
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trick_id, seat)
);

CREATE INDEX idx_trick_cards_trick_id ON trick_cards(trick_id);
CREATE INDEX idx_trick_cards_game_id ON trick_cards(game_id);

-- ============================================================
-- GAME EVENTS (activity log)
-- ============================================================
CREATE TYPE event_type AS ENUM (
  'player_joined', 'player_left', 'game_started', 'cards_dealt',
  'bid_placed', 'bid_passed', 'contract_set', 'kitty_exchanged',
  'card_played', 'trick_won', 'round_scored', 'game_won'
);

CREATE TABLE game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  event_type event_type NOT NULL,
  player_id UUID REFERENCES profiles(id),
  seat INTEGER,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_game_events_game_id ON game_events(game_id);
CREATE INDEX idx_game_events_created_at ON game_events(game_id, created_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hands_updated_at BEFORE UPDATE ON hands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Player'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE tricks ENABLE ROW LEVEL SECURITY;
ALTER TABLE trick_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_in_game" ON profiles
  FOR SELECT USING (
    id IN (
      SELECT player_id FROM game_players
      WHERE game_id IN (
        SELECT game_id FROM game_players WHERE player_id = auth.uid()
      )
    )
  );

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- GAMES
-- Everyone can read games (for lobby/join by code)
-- Only players in the game can see details
-- Mutations only via edge functions (service role)
-- ============================================================
CREATE POLICY "games_select_public" ON games
  FOR SELECT USING (
    phase = 'lobby'
    OR id IN (
      SELECT game_id FROM game_players WHERE player_id = auth.uid()
    )
  );

-- Edge functions use service role, bypassing RLS

-- ============================================================
-- GAME_PLAYERS
-- ============================================================
CREATE POLICY "game_players_select" ON game_players
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players WHERE player_id = auth.uid()
    )
  );

-- ============================================================
-- ROUNDS
-- ============================================================
CREATE POLICY "rounds_select" ON rounds
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players WHERE player_id = auth.uid()
    )
  );

-- ============================================================
-- HANDS - CRITICAL: Players only see their own cards
-- ============================================================
CREATE POLICY "hands_select_own" ON hands
  FOR SELECT USING (player_id = auth.uid());

-- ============================================================
-- BIDS - All players in game can see all bids
-- ============================================================
CREATE POLICY "bids_select" ON bids
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players WHERE player_id = auth.uid()
    )
  );

-- ============================================================
-- TRICKS - All players can see completed tricks
-- ============================================================
CREATE POLICY "tricks_select" ON tricks
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players WHERE player_id = auth.uid()
    )
  );

-- ============================================================
-- TRICK_CARDS - All players can see played cards
-- ============================================================
CREATE POLICY "trick_cards_select" ON trick_cards
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players WHERE player_id = auth.uid()
    )
  );

-- ============================================================
-- GAME_EVENTS
-- ============================================================
CREATE POLICY "game_events_select" ON game_events
  FOR SELECT USING (
    game_id IN (
      SELECT game_id FROM game_players WHERE player_id = auth.uid()
    )
  );

-- ============================================================
-- REALTIME PUBLICATIONS
-- ============================================================
-- Enable realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE bids;
ALTER PUBLICATION supabase_realtime ADD TABLE tricks;
ALTER PUBLICATION supabase_realtime ADD TABLE trick_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE game_events;
-- Note: hands is NOT in realtime - clients poll/refresh their own hand
-- after game state changes to prevent leaking card info

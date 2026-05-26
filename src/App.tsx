// src/App.tsx
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useGameStore } from './lib/store';
import { LoginPage } from './pages/LoginPage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';

export default function App() {
  const { user, setUser, setProfile } = useGameStore();
  const [loading, setLoading] = useState(true);
  const [gameId, setGameId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id });

        const { data: profile } = await supabase.from('profiles')
          .select('*').eq('id', session.user.id).single();
        if (profile) setProfile(profile);

        // Only reconnect to games that are actively in progress
        const { data: gp } = await supabase.from('game_players')
          .select('game_id, games!inner(phase)')
          .eq('player_id', session.user.id)
          .in('games.phase', ['bidding', 'kitty_exchange', 'trick_play', 'round_scoring'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (gp?.game_id) setGameId(gp.game_id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser({ id: session.user.id });
        const { data: profile } = await supabase.from('profiles')
          .select('*').eq('id', session.user.id).single();
        if (profile) setProfile(profile);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setGameId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-felt flex items-center justify-center">
        <div className="text-gold text-2xl font-display animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  if (gameId) return <GamePage gameId={gameId} onLeave={() => setGameId(null)} />;
  return <LobbyPage onJoinGame={setGameId} />;
}

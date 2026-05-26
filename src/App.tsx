// src/App.tsx
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useGameStore } from './lib/store';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';

export default function App() {
  const { user, setUser, setProfile } = useGameStore();
  const [loading, setLoading] = useState(true);
  const [gameId, setGameId] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout);
      try {
        if (session?.user) {
          setUser({ id: session.user.id });
          const { data: profile } = await supabase.from('profiles')
            .select('*').eq('id', session.user.id).single();
          if (profile) setProfile(profile);

          // Reconnect to active game
          const { data: gp } = await supabase.from('game_players')
            .select('game_id, games!inner(phase)')
            .eq('player_id', session.user.id)
            .in('games.phase', ['bidding', 'kitty_exchange', 'trick_play', 'round_scoring'])
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle();
          if (gp?.game_id) setGameId(gp.game_id);
        }
      } catch(e) { console.warn('Session error:', e); }
      finally { setLoading(false); }
    }).catch(() => { clearTimeout(timeout); setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser({ id: session.user.id });
        const { data: profile } = await supabase.from('profiles')
          .select('*').eq('id', session.user.id).single();
        if (profile) setProfile(profile);
      } else if (event === 'SIGNED_OUT') {
        setUser(null); setProfile(null); setGameId(null);
      }
    });

    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-felt flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="text-gold text-2xl font-display animate-pulse">Loading…</div>
        <button onClick={() => setLoading(false)}
          className="text-gray-600 hover:text-gray-400 text-xs font-body mt-4 transition">
          Taking too long? Click here
        </button>
      </div>
    </div>
  );

  if (gameId) return <GamePage gameId={gameId} onLeave={() => setGameId(null)} />;
  return <HomePage onJoinGame={setGameId} />;
}

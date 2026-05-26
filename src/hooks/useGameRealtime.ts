// src/hooks/useGameRealtime.ts
import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../lib/store';

export function useGameRealtime(gameId: string | null) {
  const { loadGame } = useGameStore();

  const handleChange = useCallback(async () => {
    if (!gameId) return;
    await loadGame(gameId);
  }, [gameId, loadGame]);

  useEffect(() => {
    if (!gameId) return;

    // Initial load
    loadGame(gameId);

    const channel = supabase.channel(`game:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games',
        filter: `id=eq.${gameId}` }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players',
        filter: `game_id=eq.${gameId}` }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids',
        filter: `game_id=eq.${gameId}` }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tricks',
        filter: `game_id=eq.${gameId}` }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trick_cards',
        filter: `game_id=eq.${gameId}` }, handleChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hands',
        filter: `game_id=eq.${gameId}` }, handleChange)
      .subscribe();

    // Heartbeat
    const heartbeat = setInterval(async () => {
      const { user } = useGameStore.getState();
      if (!user) return;
      await supabase.from('game_players').update({
        is_connected: true,
        last_seen: new Date().toISOString(),
      }).eq('game_id', gameId).eq('player_id', user.id);
    }, 15000);

    // Poll every 8 seconds as fallback
    const poll = setInterval(handleChange, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(heartbeat);
      clearInterval(poll);
    };
  }, [gameId, handleChange]);
}

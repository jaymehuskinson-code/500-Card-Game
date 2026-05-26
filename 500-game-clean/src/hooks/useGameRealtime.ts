// src/hooks/useGameRealtime.ts
import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../lib/store';

export function useGameRealtime(gameId: string | null) {
  const { loadGame, refreshHand, setGame, setPlayers, game, players } = useGameStore();

  const handleGameChange = useCallback(async () => {
    if (!gameId) return;
    // Reload full state on any game change
    await loadGame(gameId);
  }, [gameId, loadGame]);

  useEffect(() => {
    if (!gameId) return;

    // Initial load
    loadGame(gameId);

    // Subscribe to game table changes
    const gameChannel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`,
      }, handleGameChange)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_players',
        filter: `game_id=eq.${gameId}`,
      }, handleGameChange)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bids',
        filter: `game_id=eq.${gameId}`,
      }, handleGameChange)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tricks',
        filter: `game_id=eq.${gameId}`,
      }, handleGameChange)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trick_cards',
        filter: `game_id=eq.${gameId}`,
      }, handleGameChange)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'game_events',
        filter: `game_id=eq.${gameId}`,
      }, handleGameChange)
      .subscribe();

    // Heartbeat to mark connected
    const heartbeat = setInterval(async () => {
      const { user } = useGameStore.getState();
      if (!user) return;
      await supabase.from('game_players').update({
        is_connected: true,
        last_seen: new Date().toISOString(),
      }).eq('game_id', gameId).eq('player_id', user.id);
    }, 15000);

    return () => {
      supabase.removeChannel(gameChannel);
      clearInterval(heartbeat);
    };
  }, [gameId, handleGameChange]);
}

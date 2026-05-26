// src/pages/LobbyPage.tsx
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../lib/store';
import { dealCards } from '../lib/gameActions';

interface LobbyPageProps {
  onJoinGame: (gameId: string) => void;
}

export function LobbyPage({ onJoinGame }: LobbyPageProps) {
  const { profile, user } = useGameStore();
  const [view, setView] = useState<'main' | 'create' | 'join'>('main');
  const [roomCode, setRoomCode] = useState('');
  const [pendingGameId, setPendingGameId] = useState<string | null>(null);
  const [pendingGame, setPendingGame] = useState<any>(null);
  const [pendingPlayers, setPendingPlayers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pendingGameId) return;
    const channel = supabase.channel(`lobby:${pendingGameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${pendingGameId}` },
        async () => {
          const { data: g } = await supabase.from('games').select('*').eq('id', pendingGameId).single();
          setPendingGame(g);
          if (g?.phase !== 'lobby') onJoinGame(pendingGameId);
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${pendingGameId}` },
        async () => {
          const { data: ps } = await supabase.from('game_players').select('*, profiles(*)').eq('game_id', pendingGameId);
          setPendingPlayers(ps ?? []);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pendingGameId, onJoinGame]);

  const handleCreate = async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const { data: game, error: e } = await supabase.from('games')
        .insert({ host_id: user.id, phase: 'lobby' }).select().single();
      if (e) throw e;
      await supabase.from('game_players').insert({ game_id: game.id, player_id: user.id, seat: 0 });
      const { data: ps } = await supabase.from('game_players').select('*, profiles(*)').eq('game_id', game.id);
      setPendingGame(game); setPendingPlayers(ps ?? []); setPendingGameId(game.id); setView('create');
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const handleJoin = async () => {
    if (!user || !roomCode.trim()) return;
    setLoading(true); setError('');
    try {
      const { data: game, error: e } = await supabase.from('games')
        .select('*, game_players(*)').eq('room_code', roomCode.toUpperCase().trim()).single();
      if (e || !game) throw new Error('Game not found');
      if (game.phase !== 'lobby') throw new Error('Game already started');
      if (game.game_players.length >= 4) throw new Error('Game is full');
      const alreadyIn = game.game_players.find((p: any) => p.player_id === user.id);
      if (alreadyIn) { setPendingGame(game); setPendingGameId(game.id); setView('create'); setLoading(false); return; }
      const takenSeats = game.game_players.map((p: any) => p.seat);
      const openSeat = [0,1,2,3].find(s => !takenSeats.includes(s))!;
      await supabase.from('game_players').insert({ game_id: game.id, player_id: user.id, seat: openSeat });
      const { data: ps } = await supabase.from('game_players').select('*, profiles(*)').eq('game_id', game.id);
      setPendingGame(game); setPendingPlayers(ps ?? []); setPendingGameId(game.id); setView('create');
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const handleStartGame = async () => {
    if (!pendingGameId) return;
    setLoading(true); setError('');
    const { error } = await dealCards(pendingGameId);
    if (error) { setError(error); setLoading(false); return; }
    onJoinGame(pendingGameId);
    setLoading(false);
  };

  const isHost = pendingGame?.host_id === user?.id;
  const canStart = isHost && pendingPlayers.length === 4;

  return (
    <div className="min-h-screen bg-felt flex items-center justify-center p-4">
      <div className="absolute inset-0 felt-texture pointer-events-none opacity-30" />
      <AnimatePresence mode="wait">
        {view === 'main' && (
          <motion.div key="main" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }} className="relative z-10 w-full max-w-md">
            <div className="bg-table-dark border border-gold/30 rounded-2xl shadow-2xl p-8 text-center">
              <h1 className="text-5xl font-display text-gold tracking-widest mb-2">500</h1>
              <p className="text-gray-400 mb-2 font-body">Welcome, <span className="text-white">{profile?.display_name}</span></p>
              <div className="flex gap-2 justify-center mb-8">
                {['♠','♥','♦','♣'].map(s => (
                  <span key={s} className={`text-xl ${s==='♥'||s==='♦'?'text-red-400':'text-gray-300'}`}>{s}</span>
                ))}
              </div>
              <div className="space-y-3">
                <button onClick={handleCreate} disabled={loading}
                  className="w-full bg-gold text-black font-display font-bold py-4 rounded-xl text-lg hover:bg-gold/90 transition shadow-lg shadow-gold/20 tracking-wide">
                  Create New Game
                </button>
                <button onClick={() => setView('join')}
                  className="w-full bg-white/5 text-white border border-white/15 font-body py-4 rounded-xl text-lg hover:bg-white/10 transition">
                  Join with Code
                </button>
              </div>
              <button onClick={() => supabase.auth.signOut()} className="mt-6 text-gray-600 hover:text-gray-400 text-sm transition font-body">Sign out</button>
            </div>
          </motion.div>
        )}

        {view === 'join' && (
          <motion.div key="join" initial={{ opacity:0, x:40 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-40 }} className="relative z-10 w-full max-w-sm">
            <div className="bg-table-dark border border-gold/30 rounded-2xl shadow-2xl p-8">
              <button onClick={() => setView('main')} className="text-gray-500 hover:text-gray-300 mb-6 flex items-center gap-1 text-sm transition font-body">← Back</button>
              <h2 className="text-2xl font-display text-gold mb-6">Join Game</h2>
              <input type="text" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="Room code (6 chars)" maxLength={6}
                className="w-full bg-black/30 border border-white/10 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-gold/60 text-center text-2xl font-display tracking-widest placeholder-gray-700 mb-4" />
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <button onClick={handleJoin} disabled={loading || roomCode.length < 4}
                className="w-full bg-gold text-black font-display font-bold py-3 rounded-lg text-lg hover:bg-gold/90 disabled:opacity-40 transition">
                {loading ? 'Joining...' : 'Join Game'}
              </button>
            </div>
          </motion.div>
        )}

        {view === 'create' && pendingGame && (
          <motion.div key="lobby" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="relative z-10 w-full max-w-lg">
            <div className="bg-table-dark border border-gold/30 rounded-2xl shadow-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-display text-gold">Game Lobby</h2>
                  <p className="text-gray-500 text-sm font-body">Share this code with friends</p>
                </div>
                <div className="text-3xl font-display text-white tracking-widest bg-black/40 px-4 py-2 rounded-lg border border-white/10">{pendingGame.room_code}</div>
              </div>
              <div className="relative bg-felt rounded-xl p-8 mb-6 aspect-[4/3]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-16 rounded-xl border-2 border-gold/20 bg-black/20 flex items-center justify-center">
                    <span className="text-gold/40 text-xs font-body">Table</span>
                  </div>
                </div>
                {[0,1,2,3].map(seat => {
                  const player = pendingPlayers.find((p: any) => p.seat === seat);
                  const positions = ['bottom-2 left-1/2 -translate-x-1/2','right-2 top-1/2 -translate-y-1/2','top-2 left-1/2 -translate-x-1/2','left-2 top-1/2 -translate-y-1/2'];
                  const teamColors = ['text-blue-400','text-amber-400','text-blue-400','text-amber-400'];
                  return (
                    <div key={seat} className={`absolute ${positions[seat]}`}>
                      <div className={`text-center px-3 py-2 rounded-lg ${player ? 'bg-black/60 border border-white/20' : 'border border-dashed border-white/10'}`}>
                        {player ? (
                          <>
                            <div className={`text-xs font-display ${teamColors[seat]}`}>{seat%2===0?'Team A':'Team B'}</div>
                            <div className="text-white text-sm font-body">{player.profiles?.display_name ?? 'Player'}</div>
                            {player.player_id === user?.id && <div className="text-gold text-xs">(you)</div>}
                          </>
                        ) : (
                          <div className="text-gray-600 text-xs font-body px-2">Seat {seat+1}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400 font-body">{pendingPlayers.length}/4 players</span>
                <span className="text-gray-500 text-sm font-body">{isHost ? (canStart ? 'Ready to start!' : 'Waiting for players...') : 'Waiting for host...'}</span>
              </div>
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              {isHost ? (
                <button onClick={handleStartGame} disabled={!canStart || loading}
                  className="w-full bg-gold text-black font-display font-bold py-4 rounded-xl text-xl hover:bg-gold/90 disabled:opacity-30 transition shadow-lg shadow-gold/20 tracking-wide">
                  {loading ? 'Starting...' : 'Start Game'}
                </button>
              ) : (
                <div className="text-center text-gray-500 font-body py-3 animate-pulse">Waiting for host to start...</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

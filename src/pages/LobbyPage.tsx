// src/pages/LobbyPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../lib/store';
import { dealCards } from '../lib/gameActions';

interface LobbyPageProps {
  onJoinGame: (gameId: string) => void;
}

export function LobbyPage({ onJoinGame }: LobbyPageProps) {
  const { profile, user } = useGameStore();
  const [view, setView] = useState<'main'|'create'|'waiting'|'browse'>('main');
  const [gameName, setGameName] = useState('');
  const [pendingGameId, setPendingGameId] = useState<string|null>(null);
  const [pendingGame, setPendingGame] = useState<any>(null);
  const [pendingPlayers, setPendingPlayers] = useState<any[]>([]);
  const [openGames, setOpenGames] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Refresh waiting room ──────────────────────────────────
  const refreshWaitingRoom = useCallback(async (gameId: string) => {
    const [{ data: g }, { data: ps }] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('game_players').select('*, profiles(*)').eq('game_id', gameId),
    ]);
    if (g) setPendingGame(g);
    setPendingPlayers(ps ?? []);
    if (g && g.phase !== 'lobby') onJoinGame(gameId);
  }, [onJoinGame]);

  // ── Open games browser ────────────────────────────────────
  useEffect(() => {
    if (view !== 'browse') return;
    const fetch = async () => {
      const { data } = await supabase.from('games')
        .select('*, game_players(count)').eq('phase', 'lobby')
        .order('created_at', { ascending: false }).limit(20);
      setOpenGames(data ?? []);
    };
    fetch();
    const ch = supabase.channel('open-games')
      .on('postgres_changes', { event:'*', schema:'public', table:'games' }, fetch)
      .on('postgres_changes', { event:'*', schema:'public', table:'game_players' }, fetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [view]);

  // ── Waiting room realtime + poll ──────────────────────────
  useEffect(() => {
    if (!pendingGameId) return;
    refreshWaitingRoom(pendingGameId);
    const ch = supabase.channel(`lobby:${pendingGameId}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'game_players', filter:`game_id=eq.${pendingGameId}` },
        () => refreshWaitingRoom(pendingGameId))
      .on('postgres_changes', { event:'*', schema:'public', table:'games', filter:`id=eq.${pendingGameId}` },
        () => refreshWaitingRoom(pendingGameId))
      .subscribe();
    const poll = setInterval(() => refreshWaitingRoom(pendingGameId), 5000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [pendingGameId, refreshWaitingRoom]);

  // ── Leave waiting room ────────────────────────────────────
  const handleLeave = async () => {
    if (!pendingGameId || !user) return;
    setLoading(true);
    await supabase.from('game_players').delete().eq('game_id', pendingGameId).eq('player_id', user.id);
    if (pendingGame?.host_id === user.id) {
      await supabase.from('games').delete().eq('id', pendingGameId);
    }
    setPendingGameId(null); setPendingGame(null); setPendingPlayers([]);
    setView('main'); setLoading(false);
  };

  // ── Create game ───────────────────────────────────────────
  const handleCreate = async () => {
    if (!user) return;
    if (!gameName.trim()) { setError('Please enter a game name'); return; }
    setLoading(true); setError('');
    try {
      // Verify profile exists before creating game
      const { data: prof } = await supabase.from('profiles').select('id').eq('id', user.id).single();
      if (!prof) throw new Error('Profile not found — please sign out and sign in again');

      const { data: game, error: e } = await supabase.from('games')
        .insert({ host_id: user.id, phase: 'lobby', game_name: gameName.trim() })
        .select().single();
      if (e) throw new Error('Could not create game: ' + e.message);

      const { error: je } = await supabase.from('game_players')
        .insert({ game_id: game.id, player_id: user.id, seat: 0 });
      if (je) throw new Error('Could not join game: ' + je.message);

      setPendingGame(game); setPendingGameId(game.id); setView('waiting');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // ── Join game ─────────────────────────────────────────────
  const handleJoin = async (gameId: string) => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const { data: game, error: e } = await supabase.from('games')
        .select('*, game_players(*)').eq('id', gameId).single();
      if (e || !game) throw new Error('Game not found');
      if (game.phase !== 'lobby') throw new Error('Game already started');
      if (game.game_players.length >= 4) throw new Error('Game is full');

      const alreadyIn = game.game_players.find((p: any) => p.player_id === user.id);
      if (!alreadyIn) {
        const taken = game.game_players.map((p: any) => p.seat);
        const openSeat = [0,1,2,3].find(s => !taken.includes(s))!;
        const { error: je } = await supabase.from('game_players')
          .insert({ game_id: game.id, player_id: user.id, seat: openSeat });
        if (je) throw new Error('Could not join: ' + je.message);
      }
      setPendingGame(game); setPendingGameId(game.id); setView('waiting');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  // ── Start game ────────────────────────────────────────────
  const handleStart = async () => {
    if (!pendingGameId) return;
    setLoading(true); setError('');
    const { error: e } = await dealCards(pendingGameId);
    if (e) { setError(e); setLoading(false); return; }
    onJoinGame(pendingGameId);
  };

  const isHost = pendingGame?.host_id === user?.id;
  const canStart = isHost && pendingPlayers.length === 4;

  const seatPositions = [
    'bottom-3 left-1/2 -translate-x-1/2',
    'right-3 top-1/2 -translate-y-1/2',
    'top-3 left-1/2 -translate-x-1/2',
    'left-3 top-1/2 -translate-y-1/2',
  ];
  const teamColors = ['text-blue-400','text-amber-400','text-blue-400','text-amber-400'];

  return (
    <div className="min-h-screen bg-felt flex items-center justify-center p-4">
      <div className="absolute inset-0 felt-texture pointer-events-none opacity-30" />
      <AnimatePresence mode="wait">

        {/* MAIN */}
        {view === 'main' && (
          <motion.div key="main" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }}
            exit={{ opacity:0, scale:0.95 }} className="relative z-10 w-full max-w-md">
            <div className="bg-table-dark border border-gold/30 rounded-2xl shadow-2xl p-8 text-center">
              <h1 className="text-5xl font-display text-gold tracking-widest mb-2">500</h1>
              <p className="text-gray-400 mb-1 font-body">Welcome, <span className="text-white">{profile?.display_name}</span></p>
              <div className="flex gap-2 justify-center mb-8">
                {['♠','♥','♦','♣'].map(s => (
                  <span key={s} className={`text-xl ${s==='♥'||s==='♦'?'text-red-400':'text-gray-300'}`}>{s}</span>
                ))}
              </div>
              <div className="space-y-3">
                <button onClick={() => { setView('create'); setError(''); setGameName(''); }}
                  className="w-full bg-gold text-black font-display font-bold py-4 rounded-xl text-lg hover:bg-gold/90 transition shadow-lg shadow-gold/20">
                  Create New Game
                </button>
                <button onClick={() => { setView('browse'); setError(''); }}
                  className="w-full bg-white/5 text-white border border-white/15 font-body py-4 rounded-xl text-lg hover:bg-white/10 transition">
                  Browse Open Games
                </button>
              </div>
              <button onClick={async () => {
                  await supabase.auth.signOut();
                  useGameStore.getState().setUser(null);
                  useGameStore.getState().setProfile(null);
                }}
                className="mt-6 text-gray-600 hover:text-gray-400 text-sm transition font-body">Sign out</button>
            </div>
          </motion.div>
        )}

        {/* CREATE */}
        {view === 'create' && (
          <motion.div key="create" initial={{ opacity:0, x:40 }} animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:-40 }} className="relative z-10 w-full max-w-sm">
            <div className="bg-table-dark border border-gold/30 rounded-2xl shadow-2xl p-8">
              <button onClick={() => setView('main')}
                className="text-gray-500 hover:text-gray-300 mb-6 flex items-center gap-1 text-sm font-body">← Back</button>
              <h2 className="text-2xl font-display text-gold mb-6">Create Game</h2>
              <label className="block text-gray-300 text-sm mb-1.5 font-body">Game name</label>
              <input type="text" value={gameName} onChange={e => setGameName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. Friday Night 500" maxLength={30} autoFocus
                className="w-full bg-black/30 border border-white/10 text-white rounded-lg px-4 py-3
                  focus:outline-none focus:border-gold/60 placeholder-gray-600 mb-4 font-body" />
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <button onClick={handleCreate} disabled={loading || !gameName.trim()}
                className="w-full bg-gold text-black font-display font-bold py-3 rounded-lg text-lg hover:bg-gold/90 disabled:opacity-40 transition">
                {loading ? 'Creating...' : 'Create Game'}
              </button>
            </div>
          </motion.div>
        )}

        {/* BROWSE */}
        {view === 'browse' && (
          <motion.div key="browse" initial={{ opacity:0, x:40 }} animate={{ opacity:1, x:0 }}
            exit={{ opacity:0, x:-40 }} className="relative z-10 w-full max-w-lg">
            <div className="bg-table-dark border border-gold/30 rounded-2xl shadow-2xl p-8">
              <button onClick={() => setView('main')}
                className="text-gray-500 hover:text-gray-300 mb-6 flex items-center gap-1 text-sm font-body">← Back</button>
              <h2 className="text-2xl font-display text-gold mb-6">Open Games</h2>
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              {openGames.length === 0 ? (
                <div className="text-center py-12 text-gray-600 font-body">
                  <p className="text-4xl mb-3">🃏</p>
                  <p>No open games right now.</p>
                  <p className="text-sm mt-1">Create one and invite friends!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {openGames.map(game => {
                    const count = game.game_players?.[0]?.count ?? 0;
                    const isFull = count >= 4;
                    return (
                      <div key={game.id} className="flex items-center justify-between bg-black/30 rounded-xl px-4 py-3 border border-white/5">
                        <div>
                          <p className="text-white font-display">{game.game_name || 'Unnamed Game'}</p>
                          <p className="text-gray-500 text-xs font-body mt-0.5">{count}/4 players · {game.room_code}</p>
                        </div>
                        <button onClick={() => !isFull && handleJoin(game.id)} disabled={isFull || loading}
                          className={`px-4 py-2 rounded-lg font-display text-sm transition ${isFull ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gold text-black hover:bg-gold/90'}`}>
                          {isFull ? 'Full' : loading ? '...' : 'Join'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button onClick={() => setView('create')}
                className="w-full mt-4 py-3 bg-white/5 text-white border border-white/15 font-body rounded-xl hover:bg-white/10 transition">
                + Create a new game
              </button>
            </div>
          </motion.div>
        )}

        {/* WAITING ROOM */}
        {view === 'waiting' && pendingGame && (
          <motion.div key="waiting" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
            className="relative z-10 w-full max-w-lg">
            <div className="bg-table-dark border border-gold/30 rounded-2xl shadow-2xl p-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-display text-gold">{pendingGame.game_name || 'Game Lobby'}</h2>
                  <p className="text-gray-500 text-sm font-body">Share code with friends</p>
                </div>
                <div className="text-2xl font-display text-white tracking-widest bg-black/40 px-4 py-2 rounded-lg border border-white/10">
                  {pendingGame.room_code}
                </div>
              </div>

              {/* Seat diagram */}
              <div className="relative bg-felt rounded-xl mb-6 aspect-[4/3]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-16 rounded-xl border-2 border-gold/20 bg-black/20 flex items-center justify-center">
                    <span className="text-gold/40 text-xs font-body">Table</span>
                  </div>
                </div>
                {[0,1,2,3].map(seat => {
                  const player = pendingPlayers.find((p: any) => p.seat === seat);
                  return (
                    <div key={seat} className={`absolute ${seatPositions[seat]}`}>
                      <motion.div key={player?.player_id ?? `empty-${seat}`}
                        initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }}
                        className={`text-center px-3 py-2 rounded-lg min-w-[90px] ${player ? 'bg-black/60 border border-white/20' : 'border border-dashed border-white/10'}`}>
                        {player ? (
                          <>
                            <div className={`text-xs font-display ${teamColors[seat]}`}>{seat%2===0?'Team A':'Team B'}</div>
                            <div className="text-white text-sm font-body">{player.profiles?.display_name ?? 'Player'}</div>
                            {player.player_id === user?.id && <div className="text-gold text-xs">(you)</div>}
                          </>
                        ) : (
                          <div className="text-gray-600 text-xs font-body px-2 py-2">Waiting...</div>
                        )}
                      </motion.div>
                    </div>
                  );
                })}
              </div>

              {/* Dots */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={`w-3 h-3 rounded-full transition-all duration-500 ${i < pendingPlayers.length ? 'bg-gold' : 'bg-gray-700'}`} />
                  ))}
                  <span className="text-gray-400 font-body text-sm ml-1">{pendingPlayers.length}/4</span>
                </div>
                <span className="text-gray-500 text-sm font-body">
                  {isHost ? (canStart ? '✓ Ready!' : 'Waiting...') : 'Waiting for host...'}
                </span>
              </div>

              {error && <p className="text-red-400 text-sm mb-3 text-center">{error}</p>}

              {isHost ? (
                <button onClick={handleStart} disabled={!canStart || loading}
                  className="w-full bg-gold text-black font-display font-bold py-4 rounded-xl text-xl hover:bg-gold/90 disabled:opacity-30 transition shadow-lg shadow-gold/20">
                  {loading ? 'Starting...' : 'Start Game'}
                </button>
              ) : (
                <motion.div animate={{ opacity:[0.5,1,0.5] }} transition={{ repeat:Infinity, duration:2 }}
                  className="text-center text-gray-500 font-body py-3">
                  Waiting for host to start...
                </motion.div>
              )}

              <button onClick={handleLeave} disabled={loading}
                className="w-full mt-3 py-2 text-gray-600 hover:text-red-400 text-sm font-body transition text-center">
                {isHost ? 'Cancel & delete game' : 'Leave game'}
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

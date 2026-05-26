// src/pages/HomePage.tsx
// Single page: see open games, enter name, join or create
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../lib/store';
import { dealCards } from '../lib/gameActions';

interface HomePageProps {
  onJoinGame: (gameId: string) => void;
}

type Modal = null | 'name' | 'create' | 'waiting';

export function HomePage({ onJoinGame }: HomePageProps) {
  const { user, profile, setUser, setProfile } = useGameStore();

  const [openGames, setOpenGames] = useState<any[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [nameInput, setNameInput] = useState('');
  const [gameNameInput, setGameNameInput] = useState('');
  const [pendingAction, setPendingAction] = useState<'create' | { joinId: string } | null>(null);
  const [pendingGame, setPendingGame] = useState<any>(null);
  const [pendingPlayers, setPendingPlayers] = useState<any[]>([]);
  const [pendingGameId, setPendingGameId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Load open games (always visible) ─────────────────────
  const fetchGames = useCallback(async () => {
    const { data } = await supabase.from('games')
      .select('id, room_code, game_name, game_players(count)')
      .eq('phase', 'lobby')
      .order('created_at', { ascending: false })
      .limit(20);
    setOpenGames(data ?? []);
  }, []);

  useEffect(() => {
    fetchGames();
    const ch = supabase.channel('home-games')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, fetchGames)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players' }, fetchGames)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchGames]);

  // ── Waiting room refresh ──────────────────────────────────
  const refreshWaiting = useCallback(async (gameId: string) => {
    const [{ data: g }, { data: ps }] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('game_players').select('*, profiles(*)').eq('game_id', gameId),
    ]);
    if (g) setPendingGame(g);
    setPendingPlayers(ps ?? []);
    if (g && g.phase !== 'lobby') onJoinGame(gameId);
  }, [onJoinGame]);

  useEffect(() => {
    if (!pendingGameId) return;
    refreshWaiting(pendingGameId);
    const ch = supabase.channel(`waiting:${pendingGameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${pendingGameId}` },
        () => refreshWaiting(pendingGameId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${pendingGameId}` },
        () => refreshWaiting(pendingGameId))
      .subscribe();
    const poll = setInterval(() => refreshWaiting(pendingGameId), 4000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [pendingGameId, refreshWaiting]);

  // ── Sign in / create account ──────────────────────────────
  const signInAsGuest = async (name: string): Promise<string | null> => {
    const uid = crypto.randomUUID();
    const { data, error: e } = await supabase.auth.signUp({
      email: `guest_${uid}@500cardgame.guest`,
      password: uid,
    });
    if (e || !data.user) { setError('Could not create account: ' + (e?.message ?? 'unknown')); return null; }

    const { error: pe } = await supabase.from('profiles').upsert({
      id: data.user.id,
      display_name: name.trim(),
      games_played: 0,
      games_won: 0,
    }, { onConflict: 'id' });
    if (pe) { setError('Could not save name: ' + pe.message); return null; }

    const { data: prof } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
    setUser({ id: data.user.id });
    setProfile(prof);
    return data.user.id;
  };

  // ── Handle "Join" click ───────────────────────────────────
  const handleJoinClick = (gameId: string) => {
    setError('');
    if (!user) {
      // Need name first
      setPendingAction({ joinId: gameId });
      setModal('name');
    } else {
      doJoin(gameId, user.id);
    }
  };

  // ── Handle "Create Game" click ────────────────────────────
  const handleCreateClick = () => {
    setError('');
    if (!user) {
      setPendingAction('create');
      setModal('name');
    } else {
      setModal('create');
    }
  };

  // ── Submit name ───────────────────────────────────────────
  const handleNameSubmit = async () => {
    if (nameInput.trim().length < 2) { setError('Name must be at least 2 characters'); return; }
    setLoading(true); setError('');
    const userId = await signInAsGuest(nameInput.trim());
    if (!userId) { setLoading(false); return; }

    if (pendingAction === 'create') {
      setLoading(false);
      setModal('create');
    } else if (pendingAction && typeof pendingAction === 'object') {
      await doJoin(pendingAction.joinId, userId);
      setLoading(false);
    }
    setPendingAction(null);
  };

  // ── Do join ───────────────────────────────────────────────
  const doJoin = async (gameId: string, userId: string) => {
    setLoading(true); setError('');
    try {
      const { data: game, error: e } = await supabase.from('games')
        .select('*, game_players(*)').eq('id', gameId).single();
      if (e || !game) throw new Error('Game not found');
      if (game.phase !== 'lobby') throw new Error('Game already started');
      if (game.game_players.length >= 4) throw new Error('Game is full');

      const alreadyIn = game.game_players.find((p: any) => p.player_id === userId);
      if (!alreadyIn) {
        const taken = game.game_players.map((p: any) => p.seat);
        const seat = [0,1,2,3].find(s => !taken.includes(s))!;
        const { error: je } = await supabase.from('game_players')
          .insert({ game_id: game.id, player_id: userId, seat });
        if (je) throw new Error('Could not join: ' + je.message);
      }
      setPendingGame(game);
      setPendingGameId(game.id);
      setModal('waiting');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  // ── Create game ───────────────────────────────────────────
  const handleCreateGame = async () => {
    if (!user || !gameNameInput.trim()) { setError('Please enter a game name'); return; }
    setLoading(true); setError('');
    try {
      const { data: game, error: e } = await supabase.from('games')
        .insert({ host_id: user.id, phase: 'lobby', game_name: gameNameInput.trim() })
        .select().single();
      if (e) throw new Error('Could not create game: ' + e.message);

      const { error: je } = await supabase.from('game_players')
        .insert({ game_id: game.id, player_id: user.id, seat: 0 });
      if (je) throw new Error('Could not join game: ' + je.message);

      setPendingGame(game);
      setPendingGameId(game.id);
      setModal('waiting');
    } catch(e: any) { setError(e.message); }
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

  // ── Leave waiting room ────────────────────────────────────
  const handleLeaveWaiting = async () => {
    if (!pendingGameId || !user) return;
    setLoading(true);
    await supabase.from('game_players').delete()
      .eq('game_id', pendingGameId).eq('player_id', user.id);
    if (pendingGame?.host_id === user.id) {
      await supabase.from('games').delete().eq('id', pendingGameId);
    }
    setPendingGameId(null); setPendingGame(null); setPendingPlayers([]);
    setModal(null); setLoading(false);
    fetchGames();
  };

  // ── Sign out ──────────────────────────────────────────────
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    useGameStore.getState().setUser(null);
    useGameStore.getState().setProfile(null);
  };

  const isHost = pendingGame?.host_id === user?.id;
  const canStart = isHost && pendingPlayers.length === 4;
  const teamColors = ['text-blue-400','text-amber-400','text-blue-400','text-amber-400'];
  const seatPos = [
    'bottom-3 left-1/2 -translate-x-1/2',
    'right-3 top-1/2 -translate-y-1/2',
    'top-3 left-1/2 -translate-x-1/2',
    'left-3 top-1/2 -translate-y-1/2',
  ];

  return (
    <div className="min-h-screen bg-felt font-body">
      <div className="absolute inset-0 felt-texture pointer-events-none opacity-20" />

      {/* ── Header ── */}
      <div className="relative z-10 flex items-center justify-between px-8 pt-8 pb-4">
        <div>
          <h1 className="text-4xl font-display text-gold tracking-widest">500</h1>
          <p className="text-gray-500 text-sm">The Card Game</p>
        </div>
        <div className="flex items-center gap-4">
          {profile ? (
            <>
              <span className="text-gray-300 text-sm">Playing as <span className="text-white font-semibold">{profile.display_name}</span></span>
              <button onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-400 text-sm transition border border-white/10 px-3 py-1.5 rounded-lg hover:border-white/20">
                Sign out
              </button>
            </>
          ) : (
            <span className="text-gray-600 text-sm">Enter a name when you join or create a game</span>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="relative z-10 max-w-3xl mx-auto px-8 pb-16">

        {/* Create button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display text-white">Open Games</h2>
          <button onClick={handleCreateClick}
            className="bg-gold text-black font-display font-bold px-6 py-3 rounded-xl hover:bg-gold/90 transition shadow-lg shadow-gold/20">
            + Create New Game
          </button>
        </div>

        {error && !modal && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Games list */}
        {openGames.length === 0 ? (
          <div className="text-center py-24 text-gray-600">
            <p className="text-5xl mb-4">🃏</p>
            <p className="text-lg font-display text-gray-500">No open games</p>
            <p className="text-sm mt-2">Create one and share the code with your friends</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openGames.map(game => {
              const count = game.game_players?.[0]?.count ?? 0;
              const isFull = count >= 4;
              return (
                <motion.div key={game.id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                  className="flex items-center justify-between bg-table-dark border border-white/8 rounded-2xl px-6 py-4 hover:border-white/15 transition">
                  <div>
                    <p className="text-white font-display text-lg">{game.game_name || 'Unnamed Game'}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-gray-500 text-sm">{count}/4 players</span>
                      <span className="text-gray-700">·</span>
                      <span className="text-gray-600 text-xs font-mono tracking-widest">{game.room_code}</span>
                      {/* Mini seat dots */}
                      <div className="flex gap-1">
                        {[0,1,2,3].map(i => (
                          <div key={i} className={`w-2 h-2 rounded-full ${i < count ? 'bg-gold' : 'bg-gray-700'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoinClick(game.id)}
                    disabled={isFull || loading}
                    className={`px-6 py-2.5 rounded-xl font-display text-sm transition font-bold ${
                      isFull
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-gold text-black hover:bg-gold/90 shadow-md shadow-gold/20'
                    }`}>
                    {isFull ? 'Full' : 'Join'}
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Refresh */}
        <button onClick={fetchGames} className="mt-4 text-gray-700 hover:text-gray-500 text-xs transition w-full text-center">
          ↻ Refresh
        </button>
      </div>

      {/* ── MODALS ── */}
      <AnimatePresence>

        {/* Name modal */}
        {modal === 'name' && (
          <motion.div key="name-modal" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.9 }}
              className="bg-table-dark border border-gold/30 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
              <h2 className="text-2xl font-display text-gold mb-2">What's your name?</h2>
              <p className="text-gray-500 text-sm font-body mb-6">You'll use this name for the whole session</p>
              <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
                placeholder="Enter your name..." maxLength={20} autoFocus
                className="w-full bg-black/30 border border-white/10 text-white rounded-lg px-4 py-3
                  focus:outline-none focus:border-gold/60 placeholder-gray-600 mb-4 font-body" />
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setModal(null); setError(''); setPendingAction(null); }}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition font-body">
                  Cancel
                </button>
                <button onClick={handleNameSubmit} disabled={loading || nameInput.trim().length < 2}
                  className="flex-1 py-3 bg-gold text-black font-display font-bold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition">
                  {loading ? '...' : 'Continue'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Create game modal */}
        {modal === 'create' && (
          <motion.div key="create-modal" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }} exit={{ scale:0.9 }}
              className="bg-table-dark border border-gold/30 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
              <h2 className="text-2xl font-display text-gold mb-6">Name your game</h2>
              <input type="text" value={gameNameInput} onChange={e => setGameNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateGame()}
                placeholder="e.g. Friday Night 500" maxLength={30} autoFocus
                className="w-full bg-black/30 border border-white/10 text-white rounded-lg px-4 py-3
                  focus:outline-none focus:border-gold/60 placeholder-gray-600 mb-4 font-body" />
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setModal(null); setError(''); }}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white transition font-body">
                  Cancel
                </button>
                <button onClick={handleCreateGame} disabled={loading || !gameNameInput.trim()}
                  className="flex-1 py-3 bg-gold text-black font-display font-bold rounded-xl hover:bg-gold/90 disabled:opacity-40 transition">
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Waiting room modal */}
        {modal === 'waiting' && pendingGame && (
          <motion.div key="waiting-modal" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale:0.9, y:20 }} animate={{ scale:1, y:0 }}
              className="bg-table-dark border border-gold/30 rounded-2xl p-8 w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-display text-gold">{pendingGame.game_name || 'Waiting Room'}</h2>
                  <p className="text-gray-500 text-sm font-body">Share this code with your friends</p>
                </div>
                <div className="text-2xl font-display text-white tracking-widest bg-black/40 px-4 py-2 rounded-lg border border-white/10">
                  {pendingGame.room_code}
                </div>
              </div>

              {/* Seat diagram */}
              <div className="relative bg-felt rounded-xl mb-6 aspect-[4/3]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-16 rounded-xl border-2 border-gold/20 bg-black/20 flex items-center justify-center">
                    <span className="text-gold/40 text-xs">Table</span>
                  </div>
                </div>
                {[0,1,2,3].map(seat => {
                  const player = pendingPlayers.find((p: any) => p.seat === seat);
                  return (
                    <div key={seat} className={`absolute ${seatPos[seat]}`}>
                      <motion.div key={player?.player_id ?? `e${seat}`}
                        initial={{ scale:0.8, opacity:0 }} animate={{ scale:1, opacity:1 }}
                        className={`text-center px-3 py-2 rounded-lg min-w-[90px] ${player ? 'bg-black/60 border border-white/20' : 'border border-dashed border-white/10'}`}>
                        {player ? (
                          <>
                            <div className={`text-xs font-display ${teamColors[seat]}`}>{seat%2===0?'Team A':'Team B'}</div>
                            <div className="text-white text-sm">{player.profiles?.display_name ?? 'Player'}</div>
                            {player.player_id === user?.id && <div className="text-gold text-xs">(you)</div>}
                          </>
                        ) : (
                          <div className="text-gray-600 text-xs px-2 py-2">Waiting...</div>
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
                  <span className="text-gray-400 text-sm ml-1">{pendingPlayers.length}/4 players</span>
                </div>
                <span className="text-gray-500 text-sm">
                  {isHost ? (canStart ? '✓ Ready to start!' : 'Waiting for players...') : 'Waiting for host...'}
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
                  className="text-center text-gray-500 py-3">
                  Waiting for host to start...
                </motion.div>
              )}

              <button onClick={handleLeaveWaiting} disabled={loading}
                className="w-full mt-3 py-2 text-gray-600 hover:text-red-400 text-sm transition text-center">
                {isHost ? 'Cancel & delete game' : 'Leave game'}
              </button>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

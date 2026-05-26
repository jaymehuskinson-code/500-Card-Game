// src/pages/LoginPage.tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../lib/store';

export function LoginPage() {
  const { setProfile } = useGameStore();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    if (name.trim().length < 2) { setError('Name must be at least 2 characters'); return; }
    setLoading(true);
    setError('');

    try {
      // Generate unique guest credentials
      const uid = crypto.randomUUID();
      const email = `guest_${uid}@500cardgame.guest`;
      const password = uid;

      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('No user returned');

      // Manually upsert profile — don't rely on trigger timing
      const { error: upsertError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        display_name: name.trim(),
        games_played: 0,
        games_won: 0,
      }, { onConflict: 'id' });
      if (upsertError) throw upsertError;

      const { data: profile } = await supabase.from('profiles')
        .select('*').eq('id', data.user.id).single();
      if (profile) setProfile(profile);

    } catch (e: any) {
      setError(e.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-felt flex items-center justify-center p-4">
      <div className="absolute inset-0 felt-texture pointer-events-none opacity-30" />

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="bg-table-dark border border-gold/30 rounded-2xl shadow-2xl shadow-black/60 p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center gap-2 mb-3">
              {['♠', '♥', '♦', '♣'].map((s, i) => (
                <motion.span key={s} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`text-3xl ${s === '♥' || s === '♦' ? 'text-red-400' : 'text-gray-200'}`}>
                  {s}
                </motion.span>
              ))}
            </div>
            <h1 className="text-4xl font-display text-gold tracking-widest">500</h1>
            <p className="text-gray-400 text-sm mt-1 font-body">The Card Game</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-gray-300 text-sm mb-1.5 font-body">Your display name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStart()}
                placeholder="Enter your name..."
                maxLength={20}
                autoFocus
                className="w-full bg-black/30 border border-white/10 text-white rounded-lg px-4 py-3
                  focus:outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/30
                  placeholder-gray-600 transition font-body"
              />
            </div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm">
                {error}
              </motion.p>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleStart}
              disabled={loading || name.trim().length < 2}
              className="w-full bg-gold text-black font-bold py-3 rounded-lg text-lg
                hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed
                transition shadow-lg shadow-gold/20 font-display tracking-wide"
            >
              {loading ? 'Entering...' : 'Enter the Table'}
            </motion.button>
          </div>

          <p className="text-center text-gray-600 text-xs mt-6 font-body">
            No account needed · Guest session
          </p>
        </div>
      </motion.div>
    </div>
  );
}

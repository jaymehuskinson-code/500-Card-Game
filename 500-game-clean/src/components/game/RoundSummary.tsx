// src/components/game/RoundSummary.tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { dealCards } from '../../lib/gameActions';
import { useGameStore } from '../../lib/store';
import { TRUMP_DISPLAY } from '../../lib/cards';
import type { TrumpSuit } from '../../lib/supabase';

interface RoundSummaryProps { gameId: string; }

export function RoundSummary({ gameId }: RoundSummaryProps) {
  const { game, currentRound, players, user } = useGameStore();
  const [loading, setLoading] = useState(false);

  if (!game || !currentRound) return null;

  const contractPlayer = players.find(p => p.seat === currentRound.bid_winner_seat);
  const contractName = contractPlayer?.profile?.display_name ?? 'Unknown';
  const isHost = game.host_id === user?.id;

  const handleNextRound = async () => {
    setLoading(true);
    await dealCards(gameId);
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity:0, scale:0.9 }} animate={{ opacity:1, scale:1 }}
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-table-dark border border-gold/40 rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <h2 className="text-3xl font-display text-gold text-center mb-1">Round Over</h2>
        <p className="text-gray-500 text-center text-sm font-body mb-6">Round {game.current_round}</p>

        <div className="bg-black/30 rounded-xl p-4 mb-4 text-center">
          <p className="text-gray-400 text-xs font-body mb-1">Contract</p>
          <p className="text-white font-display text-lg">
            {currentRound.contract_tricks} tricks · {currentRound.contract_trump ? TRUMP_DISPLAY[currentRound.contract_trump as TrumpSuit] : '?'}
          </p>
          <p className="text-gray-500 text-sm font-body">by {contractName}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {[0,1].map(team => {
            const tricks = team === 0 ? game.team_0_tricks_this_round : game.team_1_tricks_this_round;
            const delta = team === 0 ? currentRound.team_0_score_delta : currentRound.team_1_score_delta;
            const score = team === 0 ? game.team_0_score : game.team_1_score;
            const teamColor = team === 0 ? 'text-blue-400 border-blue-500/30' : 'text-amber-400 border-amber-500/30';
            return (
              <div key={team} className={`bg-black/20 rounded-xl p-4 border text-center ${teamColor}`}>
                <p className={`font-display text-lg ${teamColor.split(' ')[0]}`}>Team {team===0?'A':'B'}</p>
                <p className="text-white text-2xl font-display">{tricks} tricks</p>
                <p className={`text-sm font-body ${delta && delta > 0 ? 'text-green-400' : delta && delta < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {delta !== null ? (delta > 0 ? `+${delta}` : delta) : '—'}
                </p>
                <p className={`text-xs font-body mt-1 ${teamColor.split(' ')[0]}`}>Total: {score}</p>
              </div>
            );
          })}
        </div>

        {isHost ? (
          <button onClick={handleNextRound} disabled={loading}
            className="w-full py-3 bg-gold text-black font-display font-bold rounded-xl text-lg hover:bg-gold/90 disabled:opacity-50 transition shadow-lg shadow-gold/20">
            {loading ? 'Dealing...' : 'Deal Next Round'}
          </button>
        ) : (
          <p className="text-center text-gray-600 font-body animate-pulse">Waiting for host to deal...</p>
        )}
      </div>
    </motion.div>
  );
}

// src/components/game/GameOver.tsx
import { motion } from 'framer-motion';
import { useGameStore } from '../../lib/store';

interface GameOverProps {
  onLeave: () => void;
}

export function GameOver({ onLeave }: GameOverProps) {
  const { game, players, user } = useGameStore();
  if (!game) return null;

  const myPlayer = players.find(p => p.player_id === user?.id);
  const myTeam = myPlayer ? myPlayer.seat % 2 : -1;
  const won = game.winner_team === myTeam;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.7, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="bg-table-dark border border-gold/40 rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl"
      >
        {/* Confetti-like emoji for winner */}
        <div className="text-6xl mb-4">{won ? '🏆' : '🃏'}</div>
        <h1 className="text-4xl font-display text-gold mb-2">
          {won ? 'Victory!' : 'Defeated'}
        </h1>
        <p className="text-gray-400 font-body mb-6">
          Team {game.winner_team === 0 ? 'A' : 'B'} wins the game!
        </p>

        <div className="grid grid-cols-2 gap-3 mb-8">
          {[0, 1].map(team => {
            const score = team === 0 ? game.team_0_score : game.team_1_score;
            const isWinner = team === game.winner_team;
            return (
              <div key={team} className={`rounded-xl p-4 border ${
                isWinner ? 'bg-gold/10 border-gold/40' : 'bg-black/20 border-white/10'
              }`}>
                <p className={`font-display text-lg ${team === 0 ? 'text-blue-400' : 'text-amber-400'}`}>
                  Team {team === 0 ? 'A' : 'B'}
                </p>
                <p className={`text-3xl font-display ${isWinner ? 'text-gold' : 'text-white'}`}>{score}</p>
                {isWinner && <p className="text-gold text-xs font-body">🏆 Winner</p>}
              </div>
            );
          })}
        </div>

        <button
          onClick={onLeave}
          className="w-full py-3 bg-gold text-black font-display font-bold rounded-xl text-lg
            hover:bg-gold/90 transition"
        >
          Back to Lobby
        </button>
      </motion.div>
    </motion.div>
  );
}

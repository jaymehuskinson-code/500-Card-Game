// src/components/game/TrickArea.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { PlayingCard } from '../ui/PlayingCard';
import { TRUMP_DISPLAY, TRUMP_COLOR } from '../../lib/cards';
import { useGameStore } from '../../lib/store';
import type { TrumpSuit } from '../../lib/supabase';

interface TrickAreaProps {
  currentTrickCards: Array<{ seat: number; card: string }>;
  mySeat: number;
  trump: TrumpSuit | null;
  contractBid: string | null;
  contractBidder: string | null;
  dealerName: string | null;
}

export function TrickArea({ currentTrickCards, mySeat, trump, contractBid, contractBidder, dealerName }: TrickAreaProps) {
  const { game } = useGameStore();

  // Position cards by relative seat
  const cardPositions = [
    'bottom-4 left-1/2 -translate-x-1/2',  // mine (bottom)
    'right-4 top-1/2 -translate-y-1/2',     // right opponent
    'top-4 left-1/2 -translate-x-1/2',      // partner (top)
    'left-4 top-1/2 -translate-y-1/2',      // left opponent
  ];

  const getPosition = (seat: number) => {
    const offset = (seat - mySeat + 4) % 4;
    return cardPositions[offset];
  };

  return (
    <div className="relative w-full h-full">
      {/* Table felt */}
      <div className="absolute inset-4 rounded-3xl bg-felt-center border border-gold/10 shadow-inner-table" />

      {/* Trump + Contract info */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center z-10 pointer-events-none">
        {trump && (
          <div className="mb-1">
            <span
              className="text-lg font-display font-bold px-3 py-1 rounded-full bg-black/40 border border-white/10"
              style={{ color: TRUMP_COLOR[trump] }}
            >
              {TRUMP_DISPLAY[trump]}
            </span>
          </div>
        )}
        {contractBid && (
          <div className="text-gold/70 text-xs font-body">
            Contract: {contractBid}
            {contractBidder && <span className="text-gray-500"> by {contractBidder}</span>}
          </div>
        )}
        {!trump && dealerName && (
          <div className="text-gray-600 text-xs font-body">
            Dealer: {dealerName}
          </div>
        )}
        {/* Trick count */}
        {game && game.phase === 'trick_play' && (
          <div className="mt-1 text-gray-600 text-xs font-body">
            Trick {game.current_trick}/10
          </div>
        )}
      </div>

      {/* Scores */}
      <div className="absolute top-4 left-4 text-xs font-body space-y-1 z-10">
        <div className="text-blue-400 font-display">
          A: {game?.team_0_score ?? 0}
          <span className="text-gray-600 ml-1 font-body text-xs">({game?.team_0_tricks_this_round ?? 0} tricks)</span>
        </div>
        <div className="text-amber-400 font-display">
          B: {game?.team_1_score ?? 0}
          <span className="text-gray-600 ml-1 font-body text-xs">({game?.team_1_tricks_this_round ?? 0} tricks)</span>
        </div>
      </div>

      {/* Played cards in trick */}
      <AnimatePresence>
        {currentTrickCards.map(({ seat, card }) => (
          <motion.div
            key={`${seat}-${card}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`absolute ${getPosition(seat)}`}
          >
            <PlayingCard card={card} isSmall={false} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

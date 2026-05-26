// src/components/game/PlayerHand.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayingCard } from '../ui/PlayingCard';
import { playCard, discardKitty } from '../../lib/gameActions';
import { useGameStore } from '../../lib/store';
import { getLegalPlayStrings } from '../../lib/clientGameLogic';
import clsx from 'clsx';

interface PlayerHandProps {
  gameId: string;
  cards: string[];
  isMyTurn: boolean;
  phase: string;
  trump: string | null;
  ledSuit: string | null;
  isKittyPhase: boolean;
}

export function PlayerHand({ gameId, cards, isMyTurn, phase, trump, ledSuit, isKittyPhase }: PlayerHandProps) {
  const { selectedCards, toggleCardSelected, clearSelectedCards, user } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const legalCards = (phase === 'trick_play' && isMyTurn && trump)
    ? getLegalPlayStrings(cards, trump, ledSuit) : [];

  const handleCardClick = async (card: string) => {
    if (isKittyPhase) { toggleCardSelected(card); return; }
    if (phase !== 'trick_play' || !isMyTurn || !legalCards.includes(card)) return;
    if (!user) return;
    setLoading(true); setError('');
    const { error: e } = await playCard(gameId, user.id, card);
    if (e) setError(e);
    setLoading(false);
  };

  const handleDiscardKitty = async () => {
    if (selectedCards.length !== 3 || !user) return;
    setLoading(true); setError('');
    const { error: e } = await discardKitty(gameId, user.id, selectedCards);
    if (e) setError(e);
    else clearSelectedCards();
    setLoading(false);
  };

  const sortedCards = [...cards].sort((a, b) => {
    const suitOrder: Record<string,number> = { H:0, D:1, C:2, S:3, JOKER:4 };
    const rankOrder: Record<string,number> = {'4':0,'5':1,'6':2,'7':3,'8':4,'9':5,'10':6,J:7,Q:8,K:9,A:10,R:11};
    const [as, ar] = a === 'JOKER-R' ? ['JOKER','R'] : a.split('-');
    const [bs, br] = b === 'JOKER-R' ? ['JOKER','R'] : b.split('-');
    const sd = (suitOrder[as] ?? 5) - (suitOrder[bs] ?? 5);
    if (sd !== 0) return sd;
    return (rankOrder[ar] ?? 0) - (rankOrder[br] ?? 0);
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <AnimatePresence>
        {isKittyPhase && (
          <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
            className="bg-gold/10 border border-gold/30 rounded-xl px-6 py-3 text-center">
            <p className="text-gold font-display text-sm">
              Select exactly 3 cards to discard
              <span className="ml-2 text-gray-300">({selectedCards.length}/3 selected)</span>
            </p>
            <button onClick={handleDiscardKitty} disabled={selectedCards.length !== 3 || loading}
              className="mt-2 px-6 py-1.5 bg-gold text-black font-display font-bold rounded-lg disabled:opacity-30 hover:bg-gold/90 transition text-sm">
              Confirm Discard
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-red-400 text-sm font-body">{error}</p>}

      <div className="flex items-end justify-center flex-wrap gap-1.5 px-4">
        {sortedCards.map((card, i) => {
          const isPlayable = isKittyPhase || (phase === 'trick_play' && isMyTurn && legalCards.includes(card));
          const isSelected = selectedCards.includes(card);
          return (
            <PlayingCard key={card} card={card} isPlayable={isPlayable} isSelected={isSelected}
              onClick={() => handleCardClick(card)} delay={i * 0.04} />
          );
        })}
      </div>

      {phase === 'trick_play' && isMyTurn && !isKittyPhase && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="text-green-400 text-sm font-body animate-pulse">
          Your turn — play a card
        </motion.div>
      )}
      {loading && <div className="text-gold text-xs font-body animate-pulse">Playing...</div>}
    </div>
  );
}

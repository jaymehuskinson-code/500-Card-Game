// src/components/game/BiddingPanel.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BID_TABLE, SUIT_COLORS } from '../../lib/cards';
import { callEdgeFunction } from '../../lib/supabase';
import { useGameStore } from '../../lib/store';
import type { TrumpSuit } from '../../lib/supabase';
import clsx from 'clsx';

interface BiddingPanelProps {
  gameId: string;
  isMyTurn: boolean;
  currentHighestValue: number;
}

export function BiddingPanel({ gameId, isMyTurn, currentHighestValue }: BiddingPanelProps) {
  const { bids, players } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBid = async (bidEntry: typeof BID_TABLE[0]) => {
    setLoading(true); setError('');
    try {
      await callEdgeFunction('place-bid', {
        game_id: gameId,
        bid: {
          type: bidEntry.type,
          tricks: bidEntry.tricks ?? null,
          suit: bidEntry.suit ?? null,
        },
      });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const handlePass = async () => {
    setLoading(true); setError('');
    try {
      await callEdgeFunction('place-bid', { game_id: gameId, bid: { type: 'pass' } });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  // Group bids by row (6-10, NT, special)
  const suitBids = BID_TABLE.filter(b => b.type === 'suit' || b.type === 'no_trump');
  const rows: typeof BID_TABLE[] = [];
  for (let i = 0; i < suitBids.length; i += 5) rows.push(suitBids.slice(i, i + 5));
  const specialBids = BID_TABLE.filter(b => b.type === 'nullo' || b.type === 'open_nullo');

  return (
    <div className="space-y-4">
      {/* Bid History */}
      <div className="bg-black/30 rounded-xl p-3">
        <h3 className="text-gold text-xs font-display uppercase tracking-wider mb-2">Bid History</h3>
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {bids.length === 0 ? (
            <p className="text-gray-600 text-xs font-body">Waiting for first bid...</p>
          ) : (
            bids.map(bid => {
              const player = players.find(p => p.seat === bid.seat);
              const name = player?.profile?.display_name ?? `Seat ${bid.seat + 1}`;
              const isPass = bid.bid_type === 'pass';
              return (
                <div key={bid.id} className="flex items-center justify-between text-xs font-body">
                  <span className="text-gray-400">{name}</span>
                  <span className={clsx(
                    'font-bold px-2 py-0.5 rounded text-xs',
                    isPass ? 'text-gray-500' : 'text-white bg-white/10'
                  )}>
                    {isPass ? 'Pass' : (
                      bid.bid_type === 'nullo' ? 'Nullo' :
                      bid.bid_type === 'open_nullo' ? 'Open Nullo' :
                      bid.bid_type === 'no_trump' ? `${bid.tricks}NT` :
                      `${bid.tricks}${bid.suit === 'spades' ? '♠' : bid.suit === 'clubs' ? '♣' : bid.suit === 'diamonds' ? '♦' : '♥'}`
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bidding UI — only shown when it's your turn */}
      <AnimatePresence>
        {isMyTurn && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <div className="bg-black/40 rounded-xl p-4 border border-gold/20">
              <h3 className="text-gold font-display text-sm mb-3 text-center">Your Bid</h3>

              {/* Bid grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr>
                      {['Tricks', '♠', '♣', '♦', '♥', 'NT'].map(h => (
                        <th key={h} className={clsx(
                          'text-xs font-display pb-1 px-0.5',
                          h === '♥' || h === '♦' ? 'text-red-400' : 'text-gray-400'
                        )}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => {
                      const trickCount = ri + 6;
                      return (
                        <tr key={ri}>
                          <td className="text-xs text-gray-500 pr-1 font-body">{trickCount}</td>
                          {row.map(bid => {
                            const isLegal = bid.value > currentHighestValue;
                            return (
                              <td key={bid.label} className="p-0.5">
                                <button
                                  onClick={() => isLegal && handleBid(bid)}
                                  disabled={!isLegal || loading}
                                  className={clsx(
                                    'w-full text-xs font-display py-1.5 px-1 rounded transition',
                                    isLegal
                                      ? 'bg-white/10 text-white hover:bg-gold/30 hover:text-gold cursor-pointer'
                                      : 'bg-transparent text-gray-700 cursor-not-allowed line-through'
                                  )}
                                >
                                  {bid.label.replace(/\d+/, '')}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Special bids */}
              <div className="flex gap-2 mt-3">
                {specialBids.map(bid => {
                  const isLegal = bid.value > currentHighestValue;
                  return (
                    <button
                      key={bid.label}
                      onClick={() => isLegal && handleBid(bid)}
                      disabled={!isLegal || loading}
                      className={clsx(
                        'flex-1 text-sm py-2 rounded-lg font-display transition',
                        isLegal
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-500/30 hover:bg-purple-800/60'
                          : 'bg-transparent text-gray-700 border border-gray-800 cursor-not-allowed'
                      )}
                    >
                      {bid.label}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handlePass}
                disabled={loading}
                className="w-full mt-3 py-2.5 rounded-lg bg-gray-800 text-gray-300 font-display
                  hover:bg-gray-700 hover:text-white transition text-sm"
              >
                Pass
              </button>

              {error && <p className="text-red-400 text-xs mt-2 text-center">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isMyTurn && (
        <div className="text-center text-gray-600 text-sm font-body animate-pulse py-2">
          Waiting for other players to bid...
        </div>
      )}
    </div>
  );
}

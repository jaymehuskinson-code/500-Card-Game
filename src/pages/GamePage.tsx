// src/pages/GamePage.tsx
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../lib/store';
import { useGameRealtime } from '../hooks/useGameRealtime';
import { TrickArea } from '../components/game/TrickArea';
import { PlayerHand } from '../components/game/PlayerHand';
import { BiddingPanel } from '../components/game/BiddingPanel';
import { OpponentPlayer } from '../components/game/OpponentPlayer';
import { EventLog } from '../components/game/EventLog';
import { RoundSummary } from '../components/game/RoundSummary';
import { GameOver } from '../components/game/GameOver';
import { TRUMP_DISPLAY } from '../lib/cards';
import type { TrumpSuit } from '../lib/supabase';

interface GamePageProps {
  gameId: string;
  onLeave: () => void;
}

export function GamePage({ gameId, onLeave }: GamePageProps) {
  useGameRealtime(gameId);

  const { game, players, myHand, currentTrick, bids, user } = useGameStore();

  const myPlayer = useMemo(() => players.find(p => p.player_id === user?.id), [players, user]);
  const mySeat = myPlayer?.seat ?? 0;

  // Get relative player positions
  const getPlayerAtRelativeSeat = (offset: 1 | 2 | 3) => {
    const seat = (mySeat + offset) % 4;
    return players.find(p => p.seat === seat);
  };

  const rightPlayer = getPlayerAtRelativeSeat(1);  // seat+1
  const topPlayer = getPlayerAtRelativeSeat(2);    // partner
  const leftPlayer = getPlayerAtRelativeSeat(3);   // seat+3

  // Current trick cards
  const currentTrickCards = useMemo(() => {
    if (!currentTrick?.trick_cards) return [];
    return currentTrick.trick_cards
      .sort((a, b) => a.play_order - b.play_order)
      .map(tc => ({ seat: tc.seat, card: tc.card }));
  }, [currentTrick]);

  // Led suit for current trick
  const ledSuit = currentTrick?.led_suit ?? null;

  // Contract info
  const contractBidder = players.find(p => p.seat === game?.contract_bidder_seat);
  const contractDisplay = game?.contract_bid_value
    ? `${game.contract_bid_tricks} tricks · ${game.trump ? TRUMP_DISPLAY[game.trump as TrumpSuit] : ''} (${game.contract_bid_value}pts)`
    : null;

  const dealerPlayer = players.find(p => p.seat === game?.dealer_seat);
  const dealerName = dealerPlayer?.profile?.display_name ?? null;

  const isMyTurn = game?.current_turn_seat === mySeat;
  const isKittyPhase = game?.phase === 'kitty_exchange' && game?.contract_bidder_seat === mySeat;
  const isBiddingPhase = game?.phase === 'bidding';
  const isShowSummary = game?.phase === 'round_scoring';
  const isGameOver = game?.phase === 'game_over';

  // Card counts per seat
  const getCardCount = (seat: number) => {
    // We don't know opponents' exact counts from RLS — use hand tracking
    // Approximation: 10 - tricks played by that seat
    if (!game) return 0;
    const tricksPlayed = currentTrick?.trick_cards?.filter(tc => tc.seat === seat).length ?? 0;
    return Math.max(0, 10 - (game.current_trick - 1) - (tricksPlayed > 0 ? 0 : 0));
  };

  if (!game) {
    return (
      <div className="min-h-screen bg-felt flex items-center justify-center">
        <div className="text-gold text-xl font-display animate-pulse">Loading game...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-felt flex overflow-hidden font-body">
      {/* Left sidebar */}
      <div className="w-48 shrink-0 bg-black/40 border-r border-white/5 flex flex-col p-3 gap-4">
        {/* Header */}
        <div>
          <h1 className="text-gold font-display text-lg">500</h1>
          <p className="text-gray-600 text-xs">{game.room_code}</p>
        </div>

        {/* Scores */}
        <div className="space-y-2">
          <h3 className="text-gold text-xs font-display uppercase tracking-wider">Scores</h3>
          {[0, 1].map(team => {
            const score = team === 0 ? game.team_0_score : game.team_1_score;
            const tricks = team === 0 ? game.team_0_tricks_this_round : game.team_1_tricks_this_round;
            const teamPlayers = players.filter(p => p.seat % 2 === team);
            return (
              <div key={team} className={`rounded-lg p-2 border text-xs ${team === 0 ? 'border-blue-500/20 bg-blue-900/10' : 'border-amber-500/20 bg-amber-900/10'}`}>
                <div className={`font-display ${team === 0 ? 'text-blue-400' : 'text-amber-400'}`}>Team {team === 0 ? 'A' : 'B'}</div>
                <div className="text-white text-xl font-display">{score}</div>
                <div className="text-gray-600">{tricks} tricks this round</div>
                <div className="text-gray-600 mt-1">
                  {teamPlayers.map(p => p.profile?.display_name ?? '?').join(' & ')}
                </div>
              </div>
            );
          })}
        </div>

        {/* Contract */}
        {contractDisplay && (
          <div className="rounded-lg p-2 border border-gold/20 bg-gold/5">
            <h3 className="text-gold text-xs font-display uppercase tracking-wider mb-1">Contract</h3>
            <p className="text-white text-xs">{contractDisplay}</p>
            <p className="text-gray-500 text-xs">by {contractBidder?.profile?.display_name}</p>
          </div>
        )}

        {/* Game state indicator */}
        <div className="rounded-lg p-2 border border-white/5 bg-black/20">
          <h3 className="text-gray-500 text-xs uppercase tracking-wider mb-1">Phase</h3>
          <p className="text-white text-xs capitalize">{game.phase.replace(/_/g, ' ')}</p>
          {isMyTurn && game.phase !== 'round_scoring' && game.phase !== 'game_over' && (
            <motion.p
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-green-400 text-xs mt-1"
            >
              ● Your turn
            </motion.p>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <EventLog />
        </div>

        <button
          onClick={onLeave}
          className="text-gray-700 hover:text-gray-500 text-xs transition text-center"
        >
          Leave Game
        </button>
      </div>

      {/* Main table area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top opponent */}
        <div className="h-28 shrink-0 flex items-center justify-center py-2">
          {topPlayer && (
            <OpponentPlayer
              name={topPlayer.profile?.display_name ?? 'Player'}
              cardCount={10 - (game.current_trick > 0 ? game.current_trick - 1 : 0)}
              isCurrentTurn={game.current_turn_seat === topPlayer.seat}
              isDealer={game.dealer_seat === topPlayer.seat}
              teamLetter={topPlayer.seat % 2 === 0 ? 'A' : 'B'}
              position="top"
              isConnected={topPlayer.is_connected}
            />
          )}
        </div>

        {/* Middle row: left + table + right */}
        <div className="flex-1 flex gap-0 overflow-hidden">
          {/* Left opponent */}
          <div className="w-32 shrink-0 flex items-center justify-center">
            {leftPlayer && (
              <OpponentPlayer
                name={leftPlayer.profile?.display_name ?? 'Player'}
                cardCount={10 - (game.current_trick > 0 ? game.current_trick - 1 : 0)}
                isCurrentTurn={game.current_turn_seat === leftPlayer.seat}
                isDealer={game.dealer_seat === leftPlayer.seat}
                teamLetter={leftPlayer.seat % 2 === 0 ? 'A' : 'B'}
                position="left"
                isConnected={leftPlayer.is_connected}
              />
            )}
          </div>

          {/* Central trick area */}
          <div className="flex-1 relative">
            <TrickArea
              currentTrickCards={currentTrickCards}
              mySeat={mySeat}
              trump={game.trump as TrumpSuit | null}
              contractBid={contractDisplay}
              contractBidder={contractBidder?.profile?.display_name ?? null}
              dealerName={dealerName}
            />
          </div>

          {/* Right opponent */}
          <div className="w-32 shrink-0 flex items-center justify-center">
            {rightPlayer && (
              <OpponentPlayer
                name={rightPlayer.profile?.display_name ?? 'Player'}
                cardCount={10 - (game.current_trick > 0 ? game.current_trick - 1 : 0)}
                isCurrentTurn={game.current_turn_seat === rightPlayer.seat}
                isDealer={game.dealer_seat === rightPlayer.seat}
                teamLetter={rightPlayer.seat % 2 === 0 ? 'A' : 'B'}
                position="right"
                isConnected={rightPlayer.is_connected}
              />
            )}
          </div>
        </div>

        {/* Bottom: my hand or bidding */}
        <div className="shrink-0 min-h-[160px] pb-4">
          {isBiddingPhase ? (
            <div className="flex justify-center px-4">
              <div className="w-full max-w-xl">
                <BiddingPanel
                  gameId={gameId}
                  isMyTurn={isMyTurn}
                  currentHighestValue={game.contract_bid_value ?? 0}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {/* My player label */}
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-xs font-display px-2 py-0.5 rounded ${mySeat % 2 === 0 ? 'text-blue-400 bg-blue-900/20' : 'text-amber-400 bg-amber-900/20'}`}>
                  Team {mySeat % 2 === 0 ? 'A' : 'B'}
                </span>
                <span className="text-white text-sm">{myPlayer?.profile?.display_name ?? 'You'}</span>
                {game.dealer_seat === mySeat && (
                  <span className="text-gold text-xs bg-gold/10 px-1.5 py-0.5 rounded">Dealer</span>
                )}
              </div>

              {myHand && (
                <PlayerHand
                  gameId={gameId}
                  cards={myHand.cards}
                  isMyTurn={isMyTurn}
                  phase={game.phase}
                  trump={game.trump}
                  ledSuit={ledSuit}
                  isKittyPhase={isKittyPhase}
                />
              )}

              {!myHand && game.phase !== 'lobby' && (
                <p className="text-gray-600 text-sm animate-pulse font-body">Loading hand...</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Overlays */}
      {isShowSummary && <RoundSummary gameId={gameId} />}
      {isGameOver && <GameOver onLeave={onLeave} />}
    </div>
  );
}

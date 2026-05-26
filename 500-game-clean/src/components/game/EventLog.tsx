// src/components/game/EventLog.tsx
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../lib/store';
import type { GameEvent } from '../../lib/supabase';

function formatEvent(event: GameEvent, players: any[]): string {
  const player = players.find(p => p.seat === event.seat);
  const name = player?.profile?.display_name ?? `Seat ${(event.seat ?? 0) + 1}`;
  const payload = event.payload ?? {};

  switch (event.event_type) {
    case 'cards_dealt':
      return `Round ${payload.round} dealt. Dealer: Seat ${payload.dealer_seat + 1}`;
    case 'bid_placed':
      return `${name} bid ${payload.bid_value} pts`;
    case 'bid_passed':
      return payload.message ?? `${name} passed`;
    case 'contract_set':
      return `Contract: ${payload.value} pts (${payload.trump}) — ${name}`;
    case 'kitty_exchanged':
      return `${name} exchanged kitty`;
    case 'card_played':
      return `${name} played ${payload.card}`;
    case 'trick_won':
      return `${name} won trick ${payload.trick}`;
    case 'round_scored': {
      const t0d = payload.team0Delta > 0 ? `+${payload.team0Delta}` : payload.team0Delta;
      const t1d = payload.team1Delta > 0 ? `+${payload.team1Delta}` : payload.team1Delta;
      return `Round scored: A ${t0d}, B ${t1d}`;
    }
    case 'game_won':
      return `Team ${payload.winner === 0 ? 'A' : 'B'} wins! 🎉`;
    default:
      return event.event_type.replace(/_/g, ' ');
  }
}

function getEventColor(type: string): string {
  switch (type) {
    case 'trick_won': return 'text-green-400';
    case 'contract_set': return 'text-gold';
    case 'game_won': return 'text-yellow-300';
    case 'round_scored': return 'text-blue-300';
    case 'bid_passed': return 'text-gray-500';
    default: return 'text-gray-300';
  }
}

export function EventLog() {
  const { events, players } = useGameStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const reversed = [...events].reverse();

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-gold text-xs font-display uppercase tracking-wider mb-2 shrink-0">Activity</h3>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        <AnimatePresence initial={false}>
          {reversed.map(event => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`text-xs font-body ${getEventColor(event.event_type)}`}
            >
              {formatEvent(event, players)}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

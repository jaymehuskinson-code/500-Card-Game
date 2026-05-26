// src/components/game/OpponentPlayer.tsx
import { motion } from 'framer-motion';
import { CardStack } from '../ui/PlayingCard';
import clsx from 'clsx';

interface OpponentPlayerProps {
  name: string;
  cardCount: number;
  isCurrentTurn: boolean;
  isDealer: boolean;
  teamLetter: 'A' | 'B';
  position: 'top' | 'left' | 'right';
  isConnected: boolean;
}

export function OpponentPlayer({
  name, cardCount, isCurrentTurn, isDealer, teamLetter, position, isConnected
}: OpponentPlayerProps) {
  const teamColor = teamLetter === 'A' ? 'text-blue-400 border-blue-500/30' : 'text-amber-400 border-amber-500/30';
  const isHorizontal = position === 'left' || position === 'right';

  return (
    <div className={clsx(
      'flex items-center gap-2',
      isHorizontal ? 'flex-col' : 'flex-row justify-center'
    )}>
      {/* Card stack */}
      <CardStack count={cardCount} />

      {/* Player info */}
      <div className={clsx(
        'flex flex-col items-center',
        isCurrentTurn && 'relative'
      )}>
        {isCurrentTurn && (
          <motion.div
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-400"
          />
        )}

        <div className={clsx(
          'px-3 py-1.5 rounded-lg border text-xs text-center min-w-[80px]',
          isCurrentTurn ? 'bg-green-900/30 border-green-500/40' : 'bg-black/30 border-white/10',
          teamColor
        )}>
          <div className={clsx('font-display text-xs', teamColor.split(' ')[0])}>
            Team {teamLetter}
            {isDealer && <span className="ml-1 text-gold">D</span>}
          </div>
          <div className={clsx(
            'font-body truncate max-w-[100px]',
            isConnected ? 'text-white' : 'text-gray-600'
          )}>
            {name}
            {!isConnected && <span className="text-gray-700 ml-1 text-xs">(away)</span>}
          </div>
          <div className="text-gray-600 text-xs">{cardCount} cards</div>
        </div>
      </div>
    </div>
  );
}

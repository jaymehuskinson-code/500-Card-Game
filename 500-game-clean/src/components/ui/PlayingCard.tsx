// src/components/ui/PlayingCard.tsx
import { motion } from 'framer-motion';
import { getCardDisplay } from '../../lib/cards';
import clsx from 'clsx';

interface PlayingCardProps {
  card: string;
  isPlayable?: boolean;
  isSelected?: boolean;
  isFaceDown?: boolean;
  isSmall?: boolean;
  onClick?: () => void;
  delay?: number;
}

export function PlayingCard({
  card,
  isPlayable = false,
  isSelected = false,
  isFaceDown = false,
  isSmall = false,
  onClick,
  delay = 0,
}: PlayingCardProps) {
  const { symbol, rank, color } = getCardDisplay(card);
  const isRed = color === '#e53e3e';
  const isJoker = card === 'JOKER-R';

  if (isFaceDown) {
    return (
      <div className={clsx(
        'rounded-lg border border-white/10 bg-card-back flex items-center justify-center',
        isSmall ? 'w-10 h-14' : 'w-16 h-24'
      )}>
        <div className="text-white/20 text-xs">🂠</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, rotateY: 90 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      whileHover={isPlayable ? { y: -12, scale: 1.05 } : undefined}
      onClick={isPlayable || onClick ? onClick : undefined}
      className={clsx(
        'relative select-none rounded-lg border bg-card-white shadow-card',
        'flex flex-col justify-between transition-shadow',
        isSmall ? 'w-10 h-14 p-0.5 text-xs' : 'w-16 h-24 p-1.5',
        isPlayable && 'cursor-pointer hover:shadow-card-hover hover:border-gold/60',
        isSelected && 'border-gold shadow-gold -translate-y-3 ring-2 ring-gold/50',
        !isPlayable && !onClick && 'opacity-80',
        isPlayable && !isSelected ? 'border-white/40' : 'border-gold'
      )}
    >
      {/* Top rank/suit */}
      <div className={clsx('flex flex-col leading-none', isRed ? 'text-red-500' : 'text-gray-900', isSmall ? 'text-xs' : 'text-sm')}>
        <span className="font-bold font-display">{isJoker ? '★' : rank}</span>
        <span>{symbol}</span>
      </div>

      {/* Center */}
      <div className={clsx('flex items-center justify-center', isRed ? 'text-red-500' : 'text-gray-800', isSmall ? 'text-xl' : 'text-3xl')}>
        {isJoker ? '🃏' : symbol}
      </div>

      {/* Bottom rank/suit (rotated) */}
      <div className={clsx('flex flex-col leading-none rotate-180', isRed ? 'text-red-500' : 'text-gray-900', isSmall ? 'text-xs' : 'text-sm')}>
        <span className="font-bold font-display">{isJoker ? '★' : rank}</span>
        <span>{symbol}</span>
      </div>

      {/* Legal play glow */}
      {isPlayable && !isSelected && (
        <div className="absolute inset-0 rounded-lg ring-1 ring-green-400/20 bg-green-400/5 pointer-events-none" />
      )}
    </motion.div>
  );
}

// Face-down card stack for opponents
export function CardStack({ count }: { count: number }) {
  return (
    <div className="relative" style={{ width: 44, height: 60 }}>
      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-md border border-white/10 bg-card-back"
          style={{
            width: 40,
            height: 56,
            left: i * 2,
            top: i * 2,
            zIndex: i,
          }}
        />
      ))}
      {count > 0 && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-gray-700 border border-white/20 flex items-center justify-center z-10">
          <span className="text-white text-xs font-bold">{count}</span>
        </div>
      )}
    </div>
  );
}

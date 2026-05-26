// src/lib/clientGameLogic.ts
// Client-side helpers for UI hints only — server is authoritative

type Trump = string;

const SAME_COLOR: Record<string, string> = { H: 'D', D: 'H', C: 'S', S: 'C' };

function trumpSuitLetter(trump: Trump): string | null {
  const map: Record<string, string> = {
    hearts: 'H', diamonds: 'D', clubs: 'C', spades: 'S',
  };
  return map[trump] ?? null;
}

function effectiveSuit(raw: string, trump: Trump): string {
  if (raw === 'JOKER-R') return trumpSuitLetter(trump) ?? 'JOKER';
  const [suit, rank] = raw.split('-');
  const ts = trumpSuitLetter(trump);
  // Left bower: Jack of same-color suit counts as trump
  if (rank === 'J' && ts && suit === SAME_COLOR[ts]) return ts;
  return suit;
}

export function getLegalPlayStrings(hand: string[], trump: Trump, ledSuit: string | null): string[] {
  if (!ledSuit) return hand; // Leading
  if (trump === 'no_trump' || trump === 'nullo' || trump === 'open_nullo') {
    // No bowers in no-trump/nullo
    const led = hand.filter(c => {
      if (c === 'JOKER-R') return false; // Joker follows nothing
      const [suit] = c.split('-');
      return suit === ledSuit;
    });
    return led.length > 0 ? led : hand;
  }

  const ledCards = hand.filter(c => effectiveSuit(c, trump) === ledSuit);
  return ledCards.length > 0 ? ledCards : hand;
}

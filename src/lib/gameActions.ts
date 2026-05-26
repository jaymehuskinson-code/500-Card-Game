// src/lib/gameActions.ts
// Direct Supabase calls replacing edge functions — same pattern as World Cup predictor

import { supabase } from './supabase';

// ── CARD LOGIC ─────────────────────────────────────────────────────────────

export type Trump = 'hearts'|'diamonds'|'clubs'|'spades'|'no_trump'|'nullo'|'open_nullo';

function buildDeck(): string[] {
  const d: string[] = [];
  for (const s of ['H','D']) for (const r of ['4','5','6','7','8','9','10','J','Q','K','A']) d.push(`${s}-${r}`);
  for (const s of ['C','S']) for (const r of ['5','6','7','8','9','10','J','Q','K','A']) d.push(`${s}-${r}`);
  d.push('JOKER-R');
  return d; // 43 cards
}

function shuffle<T>(a: T[]): T[] {
  const d = [...a];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function trumpLetter(t: Trump | null): string | null {
  return { hearts:'H', diamonds:'D', clubs:'C', spades:'S' }[t as string] ?? null;
}

function sameColor(s: string): string {
  return ({ H:'D', D:'H', C:'S', S:'C' } as Record<string,string>)[s];
}

export function effectiveSuit(raw: string, trump: Trump | null): string {
  if (raw === 'JOKER-R') return trumpLetter(trump) ?? 'JOKER';
  const [suit, rank] = raw.split('-');
  const ts = trumpLetter(trump);
  if (ts && rank === 'J' && suit === sameColor(ts)) return ts;
  return suit;
}

function isTrump(raw: string, trump: Trump | null): boolean {
  if (!trump || trump === 'no_trump' || trump === 'nullo' || trump === 'open_nullo') return false;
  if (raw === 'JOKER-R') return true;
  const [suit, rank] = raw.split('-');
  const ts = trumpLetter(trump);
  if (!ts) return false;
  if (rank === 'J' && suit === ts) return true;
  if (rank === 'J' && suit === sameColor(ts)) return true;
  return suit === ts;
}

const RANK_VAL: Record<string,number> = {
  '4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14,'R':99
};

function cardPower(raw: string, trump: Trump | null, ledSuit: string): number {
  if (raw === 'JOKER-R') return 10000;
  const [suit, rank] = raw.split('-');
  const ts = trumpLetter(trump);
  if (ts) {
    if (rank === 'J' && suit === ts) return 5000;
    if (rank === 'J' && suit === sameColor(ts)) return 4999;
    if (isTrump(raw, trump)) return 1000 + (RANK_VAL[rank] ?? 0);
  }
  if (effectiveSuit(raw, trump) === ledSuit) return RANK_VAL[rank] ?? 0;
  return -1;
}

export function getLegalPlays(hand: string[], trump: Trump | null, ledSuit: string | null): string[] {
  if (!ledSuit) return hand;
  const noT = !trump || trump === 'no_trump' || trump === 'nullo' || trump === 'open_nullo';
  if (noT) {
    const led = hand.filter(c => c !== 'JOKER-R' && c.split('-')[0] === ledSuit);
    return led.length ? led : hand;
  }
  const led = hand.filter(c => effectiveSuit(c, trump) === ledSuit);
  return led.length ? led : hand;
}

function resolveTrick(trickCards: Record<number, string>, trump: Trump, ledSeat: number): number {
  const actualLedCard = trickCards[ledSeat];
  if (!actualLedCard) return ledSeat;
  const ledSuit = effectiveSuit(actualLedCard, trump);
  let winnerSeat = ledSeat;
  let winnerPower = cardPower(actualLedCard, trump, ledSuit);
  for (let s = 0; s < 4; s++) {
    if (s === ledSeat || !trickCards[s]) continue;
    const p = cardPower(trickCards[s], trump, ledSuit);
    if (p > winnerPower) { winnerPower = p; winnerSeat = s; }
  }
  return winnerSeat;
}

// ── BID VALUES ─────────────────────────────────────────────────────────────

export const BID_VALUES: Record<string, Record<number, number>> = {
  spades:   {6:40,  7:140, 8:240, 9:340, 10:440},
  clubs:    {6:60,  7:160, 8:260, 9:360, 10:460},
  diamonds: {6:80,  7:180, 8:280, 9:380, 10:480},
  hearts:   {6:100, 7:200, 8:300, 9:400, 10:500},
  no_trump: {6:120, 7:220, 8:320, 9:420, 10:520},
};
export const NULLO_VALUE = 250;
export const OPEN_NULLO_VALUE = 500;

export function getBidValue(type: string, tricks?: number, suit?: string): number {
  if (type === 'pass') return 0;
  if (type === 'nullo') return NULLO_VALUE;
  if (type === 'open_nullo') return OPEN_NULLO_VALUE;
  if (type === 'no_trump' && tricks) return BID_VALUES['no_trump'][tricks];
  if (type === 'suit' && suit && tricks) return BID_VALUES[suit][tricks];
  return 0;
}

// ── DEAL CARDS ─────────────────────────────────────────────────────────────

export async function dealCards(gameId: string): Promise<{ error?: string }> {
  try {
    // Load game
    const { data: game } = await supabase.from('games')
      .select('*, game_players(*)').eq('id', gameId).single();
    if (!game) return { error: 'Game not found' };
    if (game.game_players.length !== 4) return { error: 'Need exactly 4 players to deal' };

    const roundNumber = game.current_round + 1;
    const dealerSeat = game.dealer_seat !== null ? (game.dealer_seat + 1) % 4 : 0;

    // Deal
    const deck = shuffle(buildDeck());
    const hands = [deck.slice(0,10), deck.slice(10,20), deck.slice(20,30), deck.slice(30,40)];
    const kitty = deck.slice(40,43);

    // Create round
    const { data: round, error: re } = await supabase.from('rounds').insert({
      game_id: gameId,
      round_number: roundNumber,
      dealer_seat: dealerSeat,
      kitty_cards: kitty,
    }).select().single();
    if (re) return { error: re.message };

    // Create hands
    const players = [...game.game_players].sort((a: any, b: any) => a.seat - b.seat);
    for (let seat = 0; seat < 4; seat++) {
      const player = players.find((p: any) => p.seat === seat);
      if (!player) continue;
      await supabase.from('hands').insert({
        game_id: gameId,
        round_id: round.id,
        player_id: player.player_id,
        seat,
        cards: hands[seat],
        original_cards: hands[seat],
      });
    }

    const firstBidSeat = (dealerSeat + 1) % 4;

    await supabase.from('games').update({
      phase: 'bidding',
      current_round: roundNumber,
      dealer_seat: dealerSeat,
      current_turn_seat: firstBidSeat,
      trump: null,
      contract_bid_value: null,
      contract_bid_tricks: null,
      contract_bidder_seat: null,
      team_0_tricks_this_round: 0,
      team_1_tricks_this_round: 0,
      current_trick: 0,
    }).eq('id', gameId);

    await supabase.from('game_events').insert({
      game_id: gameId,
      event_type: 'cards_dealt',
      payload: { round: roundNumber, dealer_seat: dealerSeat },
    });

    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

// ── PLACE BID ──────────────────────────────────────────────────────────────

export async function placeBid(
  gameId: string,
  playerId: string,
  type: string,
  tricks?: number,
  suit?: string
): Promise<{ error?: string }> {
  try {
    const { data: game } = await supabase.from('games')
      .select('*, game_players(*)').eq('id', gameId).single();
    if (!game || game.phase !== 'bidding') return { error: 'Not in bidding phase' };

    const player = game.game_players.find((p: any) => p.player_id === playerId);
    if (!player) return { error: 'Not in this game' };
    if (player.seat !== game.current_turn_seat) return { error: 'Not your turn' };

    const { data: round } = await supabase.from('rounds')
      .select('*').eq('game_id', gameId).eq('round_number', game.current_round).single();

    const { data: existingBids } = await supabase.from('bids')
      .select('*').eq('round_id', round.id).order('bid_order');

    const bidValue = getBidValue(type, tricks, suit);
    const currentHighest = game.contract_bid_value ?? 0;

    if (type !== 'pass' && bidValue <= currentHighest) return { error: 'Bid too low' };

    await supabase.from('bids').insert({
      game_id: gameId,
      round_id: round.id,
      player_id: playerId,
      seat: player.seat,
      bid_type: type,
      tricks: tricks ?? null,
      suit: suit ?? null,
      bid_value: bidValue,
      bid_order: (existingBids?.length ?? 0) + 1,
    });

    const allBids = [...(existingBids ?? []), { bid_type: type, seat: player.seat, bid_value: bidValue }];
    const validBidExists = allBids.some((b: any) => b.bid_type !== 'pass');
    const allFourPassed = allBids.length >= 4 && allBids.slice(-4).every((b: any) => b.bid_type === 'pass');
    const lastThreePassed = validBidExists && allBids.length >= 3 &&
      allBids.slice(-3).every((b: any) => b.bid_type === 'pass');

    if (allFourPassed) {
      // Redeal
      await supabase.from('game_events').insert({
        game_id: gameId, event_type: 'bid_passed', payload: { message: 'All passed, redealing' }
      });
      await supabase.from('games').update({ phase: 'round_scoring' }).eq('id', gameId);
      return {};
    }

    if (lastThreePassed) {
      // Bidding over — find winner
      const winningBid = allBids
        .filter((b: any) => b.bid_type !== 'pass')
        .reduce((best: any, b: any) => b.bid_value > best.bid_value ? b : best);

      const contractTrump = winningBid.bid_type === 'nullo' ? 'nullo'
        : winningBid.bid_type === 'open_nullo' ? 'open_nullo'
        : winningBid.bid_type === 'no_trump' ? 'no_trump'
        : winningBid.suit;

      await supabase.from('rounds').update({
        bid_winner_seat: winningBid.seat,
        contract_tricks: winningBid.tricks ?? null,
        contract_trump: contractTrump,
        contract_value: winningBid.bid_value,
      }).eq('id', round.id);

      const winnerPlayer = game.game_players.find((p: any) => p.seat === winningBid.seat);
      const { data: winnerHand } = await supabase.from('hands')
        .select('*').eq('round_id', round.id).eq('player_id', winnerPlayer.player_id).single();

      // Give winner the kitty
      await supabase.from('hands').update({
        cards: [...winnerHand.cards, ...round.kitty_cards],
      }).eq('id', winnerHand.id);

      await supabase.from('games').update({
        phase: 'kitty_exchange',
        trump: contractTrump,
        contract_bid_value: winningBid.bid_value,
        contract_bid_tricks: winningBid.tricks ?? null,
        contract_bidder_seat: winningBid.seat,
        current_turn_seat: winningBid.seat,
      }).eq('id', gameId);

      await supabase.from('game_events').insert({
        game_id: gameId, event_type: 'contract_set',
        payload: { seat: winningBid.seat, value: winningBid.bid_value, trump: contractTrump },
      });
    } else {
      // Advance turn — skip passed players
      const passedSeats = new Set(allBids.filter((b: any) => b.bid_type === 'pass').map((b: any) => b.seat));
      let nextSeat = (player.seat + 1) % 4;
      let loops = 0;
      while (passedSeats.has(nextSeat) && loops < 4) {
        nextSeat = (nextSeat + 1) % 4;
        loops++;
      }
      const updates: any = { current_turn_seat: nextSeat };
      if (type !== 'pass') {
        updates.contract_bid_value = bidValue;
        updates.contract_bidder_seat = player.seat;
        updates.contract_bid_tricks = tricks ?? null;
      }
      await supabase.from('games').update(updates).eq('id', gameId);
      await supabase.from('game_events').insert({
        game_id: gameId,
        event_type: type === 'pass' ? 'bid_passed' : 'bid_placed',
        player_id: playerId,
        seat: player.seat,
        payload: { bid_value: bidValue, bid_type: type },
      });
    }

    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

// ── DISCARD KITTY ──────────────────────────────────────────────────────────

export async function discardKitty(
  gameId: string,
  playerId: string,
  discardCards: string[]
): Promise<{ error?: string }> {
  try {
    if (discardCards.length !== 3) return { error: 'Must discard exactly 3 cards' };

    const { data: game } = await supabase.from('games')
      .select('*, game_players(*)').eq('id', gameId).single();
    if (!game || game.phase !== 'kitty_exchange') return { error: 'Not in kitty exchange phase' };

    const player = game.game_players.find((p: any) => p.player_id === playerId);
    if (!player || player.seat !== game.contract_bidder_seat) {
      return { error: 'Only contract winner exchanges kitty' };
    }

    const { data: hand } = await supabase.from('hands')
      .select('*').eq('game_id', gameId).eq('player_id', playerId)
      .order('created_at', { ascending: false }).limit(1).single();
    if (!hand) return { error: 'Hand not found' };

    for (const card of discardCards) {
      if (!hand.cards.includes(card)) return { error: `Card ${card} not in hand` };
    }

    const newHand = hand.cards.filter((c: string) => !discardCards.includes(c));
    if (newHand.length !== 10) return { error: 'Hand must have 10 cards after discard' };

    await supabase.from('hands').update({ cards: newHand }).eq('id', hand.id);

    const { data: round } = await supabase.from('rounds')
      .select('*').eq('game_id', gameId).eq('round_number', game.current_round).single();

    await supabase.from('tricks').insert({
      game_id: gameId,
      round_id: round.id,
      trick_number: 1,
      led_seat: game.contract_bidder_seat,
    });

    await supabase.from('games').update({
      phase: 'trick_play',
      current_trick: 1,
      current_turn_seat: game.contract_bidder_seat,
    }).eq('id', gameId);

    await supabase.from('game_events').insert({
      game_id: gameId, event_type: 'kitty_exchanged',
      player_id: playerId, seat: player.seat, payload: {},
    });

    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

// ── PLAY CARD ──────────────────────────────────────────────────────────────

export async function playCard(
  gameId: string,
  playerId: string,
  card: string
): Promise<{ error?: string }> {
  try {
    const { data: game } = await supabase.from('games')
      .select('*, game_players(*)').eq('id', gameId).single();
    if (!game || game.phase !== 'trick_play') return { error: 'Not in trick play phase' };

    const player = game.game_players.find((p: any) => p.player_id === playerId);
    if (!player) return { error: 'Not in game' };
    if (player.seat !== game.current_turn_seat) return { error: 'Not your turn' };

    const { data: trick } = await supabase.from('tricks')
      .select('*, trick_cards(*)').eq('game_id', gameId)
      .eq('trick_number', game.current_trick).single();
    if (!trick) return { error: 'Trick not found' };

    const { data: hand } = await supabase.from('hands')
      .select('*').eq('game_id', gameId).eq('player_id', playerId)
      .order('created_at', { ascending: false }).limit(1).single();
    if (!hand || !hand.cards.includes(card)) return { error: 'Card not in hand' };

    const trump = game.trump as Trump;
    const existingPlays: any[] = trick.trick_cards ?? [];
    const isFirstPlay = existingPlays.length === 0;

    let ledSuit: string | null = null;
    if (!isFirstPlay) {
      ledSuit = effectiveSuit(existingPlays[0].card, trump);
    }

    const legal = getLegalPlays(hand.cards, trump, ledSuit);
    if (!legal.includes(card)) return { error: 'Illegal card — must follow suit' };

    await supabase.from('trick_cards').insert({
      game_id: gameId,
      trick_id: trick.id,
      player_id: playerId,
      seat: player.seat,
      card,
      play_order: existingPlays.length,
    });

    const newCards = hand.cards.filter((c: string) => c !== card);
    await supabase.from('hands').update({ cards: newCards }).eq('id', hand.id);

    if (isFirstPlay) {
      const actualLedSuit = effectiveSuit(card, trump);
      await supabase.from('tricks').update({ led_suit: actualLedSuit }).eq('id', trick.id);
    }

    await supabase.from('game_events').insert({
      game_id: gameId, event_type: 'card_played',
      player_id: playerId, seat: player.seat,
      payload: { card, trick: game.current_trick },
    });

    const allPlays = [...existingPlays, { seat: player.seat, card }];

    if (allPlays.length < 4) {
      const nextSeat = (player.seat + 1) % 4;
      await supabase.from('games').update({ current_turn_seat: nextSeat }).eq('id', gameId);
    } else {
      // Resolve trick
      const trickCards: Record<number, string> = {};
      allPlays.forEach((p: any) => { trickCards[p.seat] = p.card; });
      const winnerSeat = resolveTrick(trickCards, trump, trick.led_seat);

      await supabase.from('tricks').update({ winner_seat: winnerSeat }).eq('id', trick.id);

      const winnerTeam = winnerSeat % 2;
      const t0 = game.team_0_tricks_this_round + (winnerTeam === 0 ? 1 : 0);
      const t1 = game.team_1_tricks_this_round + (winnerTeam === 1 ? 1 : 0);

      await supabase.from('game_events').insert({
        game_id: gameId, event_type: 'trick_won',
        seat: winnerSeat,
        payload: { trick: game.current_trick, winner_seat: winnerSeat },
      });

      const nextTrickNumber = game.current_trick + 1;

      if (nextTrickNumber > 10) {
        // Score round
        const { data: round } = await supabase.from('rounds')
          .select('*').eq('game_id', gameId).eq('round_number', game.current_round).single();

        const isNullo = game.trump === 'nullo' || game.trump === 'open_nullo';
        const ct = game.contract_bidder_seat % 2;
        const contractorTricks = ct === 0 ? t0 : t1;
        const defenderTricks = ct === 0 ? t1 : t0;
        const contractValue = game.contract_bid_value ?? 0;
        const contractTricks = game.contract_bid_tricks ?? 0;

        const contractorDelta = isNullo
          ? (contractorTricks === 0 ? contractValue : -contractValue)
          : (contractorTricks >= contractTricks ? contractValue : -contractValue);
        const defenderDelta = defenderTricks * 10;

        const team0Delta = ct === 0 ? contractorDelta : defenderDelta;
        const team1Delta = ct === 1 ? contractorDelta : defenderDelta;
        const newTeam0Score = game.team_0_score + team0Delta;
        const newTeam1Score = game.team_1_score + team1Delta;

        await supabase.from('rounds').update({
          team_0_tricks: t0, team_1_tricks: t1,
          team_0_score_delta: team0Delta, team_1_score_delta: team1Delta,
        }).eq('id', round.id);

        const over = newTeam0Score >= 500 || newTeam1Score >= 500 ||
          newTeam0Score <= -500 || newTeam1Score <= -500;
        const winner = (newTeam0Score >= 500 || newTeam1Score <= -500) ? 0 : 1;

        await supabase.from('games').update({
          phase: over ? 'game_over' : 'round_scoring',
          team_0_score: newTeam0Score,
          team_1_score: newTeam1Score,
          team_0_tricks_this_round: t0,
          team_1_tricks_this_round: t1,
          winner_team: over ? winner : null,
          current_turn_seat: winnerSeat,
        }).eq('id', gameId);

        await supabase.from('game_events').insert({
          game_id: gameId,
          event_type: over ? 'game_won' : 'round_scored',
          payload: { team0Delta, team1Delta, newTeam0Score, newTeam1Score, winner: over ? winner : null },
        });
      } else {
        const { data: round } = await supabase.from('rounds')
          .select('id').eq('game_id', gameId).eq('round_number', game.current_round).single();

        await supabase.from('tricks').insert({
          game_id: gameId,
          round_id: round.id,
          trick_number: nextTrickNumber,
          led_seat: winnerSeat,
        });

        await supabase.from('games').update({
          current_trick: nextTrickNumber,
          current_turn_seat: winnerSeat,
          team_0_tricks_this_round: t0,
          team_1_tricks_this_round: t1,
        }).eq('id', gameId);
      }
    }

    return {};
  } catch (e: any) {
    return { error: e.message };
  }
}

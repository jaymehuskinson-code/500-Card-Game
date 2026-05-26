// supabase/functions/place-bid/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  Bid, getBidValue, isValidBid, NULLO_VALUE, OPEN_NULLO_VALUE
} from '../shared/gameLogic.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization')!;
    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { game_id, bid } = await req.json() as { game_id: string; bid: Bid };

    // Load game + round
    const { data: game } = await supabase.from('games')
      .select('*, game_players(*)')
      .eq('id', game_id).single();

    if (!game || game.phase !== 'bidding') {
      return new Response(JSON.stringify({ error: 'Not in bidding phase' }), { status: 400, headers: corsHeaders });
    }

    // Verify it's this player's turn
    const player = game.game_players.find((p: any) => p.player_id === user.id);
    if (!player) return new Response(JSON.stringify({ error: 'Not in this game' }), { status: 403, headers: corsHeaders });
    if (player.seat !== game.current_turn_seat) {
      return new Response(JSON.stringify({ error: 'Not your turn' }), { status: 400, headers: corsHeaders });
    }

    // Get current round
    const { data: round } = await supabase.from('rounds')
      .select('*')
      .eq('game_id', game_id)
      .eq('round_number', game.current_round)
      .single();

    // Get existing bids for this round
    const { data: existingBids } = await supabase.from('bids')
      .select('*')
      .eq('round_id', round.id)
      .order('bid_order');

    const currentHighest = game.contract_bid_value ?? 0;

    // Validate bid
    if (!isValidBid(bid, currentHighest)) {
      return new Response(JSON.stringify({ error: 'Bid too low' }), { status: 400, headers: corsHeaders });
    }

    const bidValue = getBidValue(bid);
    const bidOrder = (existingBids?.length ?? 0) + 1;

    // Insert bid
    await supabase.from('bids').insert({
      game_id,
      round_id: round.id,
      player_id: user.id,
      seat: player.seat,
      bid_type: bid.type,
      tricks: bid.tricks ?? null,
      suit: bid.suit ?? null,
      bid_value: bidValue,
      bid_order: bidOrder,
    });

    // Check if bidding is over:
    // - After a valid bid, need 3 consecutive passes
    // - If all 4 players pass from start, re-deal (not implemented here, simplification)
    const allBids = [...(existingBids ?? []), { bid_type: bid.type, seat: player.seat, bid_value: bidValue }];
    const lastThree = allBids.slice(-3);
    const validBidExists = allBids.some((b: any) => b.bid_type !== 'pass');
    const biddingOver = validBidExists && lastThree.length >= 3 && lastThree.every((b: any) => b.bid_type === 'pass');
    const allFourPassed = allBids.length === 4 && allBids.every((b: any) => b.bid_type === 'pass');

    if (allFourPassed) {
      // Re-deal — advance dealer and redeal
      await supabase.from('game_events').insert({ game_id, event_type: 'bid_passed', payload: { message: 'All passed, redealing' } });
      await supabase.from('games').update({ phase: 'round_scoring' }).eq('id', game_id);
      return new Response(JSON.stringify({ success: true, action: 'redeal' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (biddingOver) {
      // Find winning bid
      const winningBid = allBids.filter((b: any) => b.bid_type !== 'pass')
        .reduce((best: any, b: any) => b.bid_value > best.bid_value ? b : best);

      const contractTrump = winningBid.bid_type === 'nullo' ? 'nullo'
        : winningBid.bid_type === 'open_nullo' ? 'open_nullo'
        : winningBid.bid_type === 'no_trump' ? 'no_trump'
        : winningBid.suit;

      // Update round with contract
      await supabase.from('rounds').update({
        bid_winner_seat: winningBid.seat,
        contract_tricks: winningBid.tricks ?? null,
        contract_trump: contractTrump,
        contract_value: winningBid.bid_value,
      }).eq('id', round.id);

      // Get winner's player_id to give them kitty
      const winnerPlayer = game.game_players.find((p: any) => p.seat === winningBid.seat);

      // Update game: move to kitty exchange phase
      await supabase.from('games').update({
        phase: 'kitty_exchange',
        trump: contractTrump,
        contract_bid_value: winningBid.bid_value,
        contract_bid_tricks: winningBid.tricks ?? null,
        contract_bidder_seat: winningBid.seat,
        current_turn_seat: winningBid.seat,
      }).eq('id', game_id);

      // Add kitty to winner's hand
      const { data: winnerHand } = await supabase.from('hands')
        .select('*').eq('round_id', round.id).eq('player_id', winnerPlayer.player_id).single();

      await supabase.from('hands').update({
        cards: [...winnerHand.cards, ...round.kitty_cards],
      }).eq('id', winnerHand.id);

      await supabase.from('rounds').update({ kitty_revealed: true }).eq('id', round.id);

      await supabase.from('game_events').insert({
        game_id, event_type: 'contract_set',
        payload: { seat: winningBid.seat, value: winningBid.bid_value, trump: contractTrump },
      });
    } else {
      // Advance turn clockwise
      const nextSeat = (player.seat + 1) % 4;
      const updates: any = { current_turn_seat: nextSeat };
      if (bid.type !== 'pass') {
        updates.contract_bid_value = bidValue;
        updates.contract_bidder_seat = player.seat;
        updates.contract_bid_tricks = bid.tricks ?? null;
      }
      await supabase.from('games').update(updates).eq('id', game_id);

      await supabase.from('game_events').insert({
        game_id,
        event_type: bid.type === 'pass' ? 'bid_passed' : 'bid_placed',
        player_id: user.id,
        seat: player.seat,
        payload: { bid_value: bidValue, bid_type: bid.type },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

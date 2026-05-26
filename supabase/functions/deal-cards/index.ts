// supabase/functions/deal-cards/index.ts
// Called by host after lobby is full to deal cards for a new round

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateDeck, dealCards } from '../shared/gameLogic.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // service role bypasses RLS
    );

    // Get requesting user
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    ).auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { game_id } = await req.json();

    // Validate: must be host, game must be in lobby phase
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*, game_players(*)')
      .eq('id', game_id)
      .single();

    if (gameError || !game) return new Response(JSON.stringify({ error: 'Game not found' }), { status: 404, headers: corsHeaders });
    if (game.host_id !== user.id) return new Response(JSON.stringify({ error: 'Only host can start' }), { status: 403, headers: corsHeaders });
    if (game.game_players.length !== 4) return new Response(JSON.stringify({ error: 'Need 4 players' }), { status: 400, headers: corsHeaders });
    if (!['lobby', 'round_scoring'].includes(game.phase)) return new Response(JSON.stringify({ error: 'Wrong phase' }), { status: 400, headers: corsHeaders });

    // Determine dealer seat for this round
    const roundNumber = game.current_round + 1;
    const dealerSeat = game.dealer_seat !== null
      ? (game.dealer_seat + 1) % 4  // rotate dealer
      : 0; // first round

    // Deal cards
    const deck = generateDeck();
    const { hands, kitty } = dealCards(deck);

    // Sort players by seat
    const players = [...game.game_players].sort((a: any, b: any) => a.seat - b.seat);

    // Create round
    const { data: round, error: roundError } = await supabase
      .from('rounds')
      .insert({
        game_id,
        round_number: roundNumber,
        dealer_seat: dealerSeat,
        kitty_cards: kitty,
      })
      .select()
      .single();

    if (roundError) throw roundError;

    // Create hands for each player (by seat order)
    for (let seat = 0; seat < 4; seat++) {
      const player = players.find((p: any) => p.seat === seat);
      if (!player) throw new Error(`No player at seat ${seat}`);
      await supabase.from('hands').insert({
        game_id,
        round_id: round.id,
        player_id: player.player_id,
        seat,
        cards: hands[seat],
        original_cards: hands[seat],
      });
    }

    // Determine who bids first: left of dealer
    const firstBidSeat = (dealerSeat + 1) % 4;

    // Update game state
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
    }).eq('id', game_id);

    // Log event
    await supabase.from('game_events').insert({
      game_id,
      event_type: 'cards_dealt',
      payload: { round: roundNumber, dealer_seat: dealerSeat },
    });

    return new Response(JSON.stringify({ success: true, round_id: round.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

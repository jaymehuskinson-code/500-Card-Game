// supabase/functions/discard-kitty/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { game_id, discard_cards } = await req.json() as { game_id: string; discard_cards: string[] };

    if (!Array.isArray(discard_cards) || discard_cards.length !== 3) {
      return new Response(JSON.stringify({ error: 'Must discard exactly 3 cards' }), { status: 400, headers: corsHeaders });
    }

    const { data: game } = await supabase.from('games')
      .select('*, game_players(*)').eq('id', game_id).single();

    if (!game || game.phase !== 'kitty_exchange') {
      return new Response(JSON.stringify({ error: 'Not in kitty exchange phase' }), { status: 400, headers: corsHeaders });
    }

    const player = game.game_players.find((p: any) => p.player_id === user.id);
    if (!player || player.seat !== game.contract_bidder_seat) {
      return new Response(JSON.stringify({ error: 'Only contract winner exchanges kitty' }), { status: 403, headers: corsHeaders });
    }

    // Get player's current hand (which includes kitty already)
    const { data: hand } = await supabase.from('hands')
      .select('*')
      .eq('game_id', game_id)
      .eq('player_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!hand) return new Response(JSON.stringify({ error: 'Hand not found' }), { status: 404, headers: corsHeaders });

    // Validate all discarded cards are in hand
    for (const card of discard_cards) {
      if (!hand.cards.includes(card)) {
        return new Response(JSON.stringify({ error: `Card ${card} not in hand` }), { status: 400, headers: corsHeaders });
      }
    }

    // Remove discarded cards
    const newHand = hand.cards.filter((c: string) => !discard_cards.includes(c));

    if (newHand.length !== 10) {
      return new Response(JSON.stringify({ error: 'Hand must have 10 cards after discard' }), { status: 400, headers: corsHeaders });
    }

    await supabase.from('hands').update({ cards: newHand }).eq('id', hand.id);

    // Move to trick play phase; bidder leads first trick
    const { data: round } = await supabase.from('rounds')
      .select('*').eq('game_id', game_id).eq('round_number', game.current_round).single();

    // Create first trick
    await supabase.from('tricks').insert({
      game_id,
      round_id: round.id,
      trick_number: 1,
      led_seat: game.contract_bidder_seat,
    });

    await supabase.from('games').update({
      phase: 'trick_play',
      current_trick: 1,
      current_turn_seat: game.contract_bidder_seat,
    }).eq('id', game_id);

    await supabase.from('game_events').insert({
      game_id, event_type: 'kitty_exchanged',
      player_id: user.id, seat: player.seat,
      payload: {},
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

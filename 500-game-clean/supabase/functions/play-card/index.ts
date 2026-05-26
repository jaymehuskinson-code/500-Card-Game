// supabase/functions/play-card/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  parseCard, getLegalPlays, resolveTrick, effectiveSuit,
  calculateRoundScore, checkGameOver, Trump, PlayedCard
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

    const { game_id, card } = await req.json() as { game_id: string; card: string };

    // Load game
    const { data: game } = await supabase.from('games')
      .select('*, game_players(*)').eq('id', game_id).single();

    if (!game || game.phase !== 'trick_play') {
      return new Response(JSON.stringify({ error: 'Not in trick play phase' }), { status: 400, headers: corsHeaders });
    }

    const player = game.game_players.find((p: any) => p.player_id === user.id);
    if (!player) return new Response(JSON.stringify({ error: 'Not in game' }), { status: 403, headers: corsHeaders });
    if (player.seat !== game.current_turn_seat) {
      return new Response(JSON.stringify({ error: 'Not your turn' }), { status: 400, headers: corsHeaders });
    }

    // Get current trick
    const { data: trick } = await supabase.from('tricks')
      .select('*, trick_cards(*)')
      .eq('game_id', game_id)
      .eq('trick_number', game.current_trick)
      .single();

    if (!trick) return new Response(JSON.stringify({ error: 'Trick not found' }), { status: 404, headers: corsHeaders });

    // Get player's hand
    const { data: hand } = await supabase.from('hands')
      .select('*')
      .eq('game_id', game_id)
      .eq('player_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!hand || !hand.cards.includes(card)) {
      return new Response(JSON.stringify({ error: 'Card not in hand' }), { status: 400, headers: corsHeaders });
    }

    const trump = game.trump as Trump;
    const existingPlays: any[] = trick.trick_cards ?? [];
    const isFirstPlay = existingPlays.length === 0;

    // Determine led suit from first card played
    let ledSuit: string | null = null;
    if (!isFirstPlay) {
      const firstCard = parseCard(existingPlays[0].card);
      ledSuit = effectiveSuit(firstCard, trump);
    }

    // Validate legal play
    const legal = getLegalPlays(hand.cards, trump, ledSuit, isFirstPlay);
    if (!legal.includes(card)) {
      return new Response(JSON.stringify({ error: 'Illegal card - must follow suit' }), { status: 400, headers: corsHeaders });
    }

    // Record the play
    await supabase.from('trick_cards').insert({
      game_id,
      trick_id: trick.id,
      player_id: user.id,
      seat: player.seat,
      card,
      play_order: existingPlays.length,
    });

    // Remove card from hand
    const newCards = hand.cards.filter((c: string) => c !== card);
    await supabase.from('hands').update({ cards: newCards }).eq('id', hand.id);

    // Set led_suit on trick if first play
    if (isFirstPlay) {
      const parsedCard = parseCard(card);
      const actualLedSuit = effectiveSuit(parsedCard, trump);
      await supabase.from('tricks').update({ led_suit: actualLedSuit }).eq('id', trick.id);
    }

    await supabase.from('game_events').insert({
      game_id, event_type: 'card_played',
      player_id: user.id, seat: player.seat,
      payload: { card, trick: game.current_trick },
    });

    const allPlays = [...existingPlays, { seat: player.seat, card }];

    if (allPlays.length < 4) {
      // Not done yet — advance turn
      const nextSeat = (player.seat + 1) % 4;
      await supabase.from('games').update({ current_turn_seat: nextSeat }).eq('id', game_id);
    } else {
      // Trick complete — resolve winner
      const parsedPlays: PlayedCard[] = allPlays.map((p: any) => ({
        seat: p.seat,
        card: parseCard(p.card),
      }));

      const firstCard = parseCard(allPlays[0].card);
      const trickLedSuit = effectiveSuit(firstCard, trump);
      const winnerSeat = resolveTrick(parsedPlays, trump, trickLedSuit);

      await supabase.from('tricks').update({ winner_seat: winnerSeat }).eq('id', trick.id);

      // Update trick counts
      const winnerTeam = winnerSeat % 2; // 0,2 = team 0; 1,3 = team 1
      const t0 = game.team_0_tricks_this_round + (winnerTeam === 0 ? 1 : 0);
      const t1 = game.team_1_tricks_this_round + (winnerTeam === 1 ? 1 : 0);

      await supabase.from('game_events').insert({
        game_id, event_type: 'trick_won',
        seat: winnerSeat,
        payload: { trick: game.current_trick, winner_seat: winnerSeat },
      });

      const nextTrickNumber = game.current_trick + 1;

      if (nextTrickNumber > 10) {
        // Round over — score it
        const { data: round } = await supabase.from('rounds')
          .select('*').eq('game_id', game_id).eq('round_number', game.current_round).single();

        const isNullo = game.trump === 'nullo';
        const isOpenNullo = game.trump === 'open_nullo';
        const contractorTeam = (game.contract_bidder_seat % 2) as 0 | 1;

        const { team0Delta, team1Delta } = calculateRoundScore({
          contractorTeam,
          contractorSeat: game.contract_bidder_seat,
          contractTricks: game.contract_bid_tricks ?? 0,
          contractValue: game.contract_bid_value ?? 0,
          trump: game.trump,
          team0Tricks: t0,
          team1Tricks: t1,
          isNullo,
          isOpenNullo,
        });

        const newTeam0Score = game.team_0_score + team0Delta;
        const newTeam1Score = game.team_1_score + team1Delta;

        await supabase.from('rounds').update({
          team_0_tricks: t0,
          team_1_tricks: t1,
          team_0_score_delta: team0Delta,
          team_1_score_delta: team1Delta,
        }).eq('id', round.id);

        const { over, winner } = checkGameOver(newTeam0Score, newTeam1Score);

        await supabase.from('games').update({
          phase: over ? 'game_over' : 'round_scoring',
          team_0_score: newTeam0Score,
          team_1_score: newTeam1Score,
          team_0_tricks_this_round: t0,
          team_1_tricks_this_round: t1,
          winner_team: over ? winner : null,
          current_turn_seat: winnerSeat, // not critical
        }).eq('id', game_id);

        await supabase.from('game_events').insert({
          game_id,
          event_type: over ? 'game_won' : 'round_scored',
          payload: {
            team0Delta, team1Delta,
            newTeam0Score, newTeam1Score,
            winner: over ? winner : null,
          },
        });
      } else {
        // Start next trick
        const { data: round } = await supabase.from('rounds')
          .select('id').eq('game_id', game_id).eq('round_number', game.current_round).single();

        await supabase.from('tricks').insert({
          game_id,
          round_id: round.id,
          trick_number: nextTrickNumber,
          led_seat: winnerSeat,
        });

        await supabase.from('games').update({
          current_trick: nextTrickNumber,
          current_turn_seat: winnerSeat,
          team_0_tricks_this_round: t0,
          team_1_tricks_this_round: t1,
        }).eq('id', game_id);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

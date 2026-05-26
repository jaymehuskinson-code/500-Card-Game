// src/lib/store.ts — Zustand global state
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  supabase, Game, GamePlayer, Round, Bid, Trick, Hand, GameEvent, Profile
} from './supabase';

interface GameState {
  // Auth
  user: { id: string; } | null;
  profile: Profile | null;

  // Game
  game: Game | null;
  players: GamePlayer[];
  currentRound: Round | null;
  bids: Bid[];
  tricks: Trick[];
  currentTrick: Trick | null;
  myHand: Hand | null;
  events: GameEvent[];

  // UI
  selectedCards: string[];
  lastTrickCards: Trick | null; // for animation

  // Actions
  setUser: (user: { id: string } | null) => void;
  setProfile: (p: Profile | null) => void;
  setGame: (g: Game | null) => void;
  setPlayers: (p: GamePlayer[]) => void;
  setCurrentRound: (r: Round | null) => void;
  setBids: (b: Bid[]) => void;
  setTricks: (t: Trick[]) => void;
  setCurrentTrick: (t: Trick | null) => void;
  setMyHand: (h: Hand | null) => void;
  setEvents: (e: GameEvent[]) => void;
  toggleCardSelected: (card: string) => void;
  clearSelectedCards: () => void;
  setLastTrickCards: (t: Trick | null) => void;

  // Async
  loadGame: (gameId: string) => Promise<void>;
  refreshHand: (gameId: string) => Promise<void>;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      game: null,
      players: [],
      currentRound: null,
      bids: [],
      tricks: [],
      currentTrick: null,
      myHand: null,
      events: [],
      selectedCards: [],
      lastTrickCards: null,

      setUser: (user) => set({ user }),
      setProfile: (profile) => set({ profile }),
      setGame: (game) => set({ game }),
      setPlayers: (players) => set({ players }),
      setCurrentRound: (currentRound) => set({ currentRound }),
      setBids: (bids) => set({ bids }),
      setTricks: (tricks) => set({ tricks }),
      setCurrentTrick: (currentTrick) => set({ currentTrick }),
      setMyHand: (myHand) => set({ myHand }),
      setEvents: (events) => set({ events }),
      toggleCardSelected: (card) => set(s => ({
        selectedCards: s.selectedCards.includes(card)
          ? s.selectedCards.filter(c => c !== card)
          : [...s.selectedCards, card]
      })),
      clearSelectedCards: () => set({ selectedCards: [] }),
      setLastTrickCards: (t) => set({ lastTrickCards: t }),

      loadGame: async (gameId: string) => {
        const [
          { data: game },
          { data: players },
          { data: profiles },
        ] = await Promise.all([
          supabase.from('games').select('*').eq('id', gameId).single(),
          supabase.from('game_players').select('*').eq('game_id', gameId),
          supabase.from('profiles').select('*'),
        ]);

        if (!game) return;

        // Merge profiles into players
        const playersWithProfiles = (players ?? []).map((p: any) => ({
          ...p,
          profile: profiles?.find((pr: any) => pr.id === p.player_id),
        }));

        set({ game, players: playersWithProfiles });

        if (game.current_round > 0) {
          const { data: round } = await supabase.from('rounds')
            .select('*').eq('game_id', gameId).eq('round_number', game.current_round).single();
          set({ currentRound: round });

          if (round) {
            const [
              { data: bids },
              { data: tricks },
              { data: events },
            ] = await Promise.all([
              supabase.from('bids').select('*').eq('round_id', round.id).order('bid_order'),
              supabase.from('tricks').select('*, trick_cards(*)').eq('round_id', round.id).order('trick_number'),
              supabase.from('game_events').select('*').eq('game_id', gameId).order('created_at', { ascending: false }).limit(50),
            ]);

            set({ bids: bids ?? [], tricks: tricks ?? [], events: events ?? [] });

            const currentTrick = (tricks ?? []).find((t: any) => t.trick_number === game.current_trick);
            set({ currentTrick: currentTrick ?? null });
          }
        }

        await get().refreshHand(gameId);
      },

      refreshHand: async (gameId: string) => {
        const { user } = get();
        if (!user) return;

        const { data: hand } = await supabase.from('hands')
          .select('*')
          .eq('game_id', gameId)
          .eq('player_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        set({ myHand: hand ?? null });
      },
    }),
    {
      name: 'game-500-store',
      partialize: (state) => ({ user: state.user, profile: state.profile }),
    }
  )
);

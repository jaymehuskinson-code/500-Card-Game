# 500 Card Game — Multiplayer

A real-time multiplayer 500 card game built with React, Supabase, and Netlify.

## Stack

- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Framer Motion
- **Backend**: Supabase (Postgres + Realtime + Edge Functions + Auth)
- **Hosting**: Netlify (frontend) + Supabase (backend)

## Deployment Steps

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run `supabase/migrations/001_schema.sql`
3. Then run `supabase/migrations/002_rls.sql`
4. Go to **Authentication → Settings** → enable **Anonymous sign-ins**

### 2. Deploy Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy deal-cards
supabase functions deploy place-bid
supabase functions deploy discard-kitty
supabase functions deploy play-card
```

### 3. Netlify Deploy

```bash
git init && git add . && git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/500-card-game.git
git push -u origin main
```

On netlify.com → New site → Import from GitHub → set env vars:
- `VITE_SUPABASE_URL`  
- `VITE_SUPABASE_ANON_KEY`

## Local Development

```bash
cp .env.example .env   # fill in your Supabase keys
npm install
npm run dev
```

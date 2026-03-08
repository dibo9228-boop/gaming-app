-- Add total XP (نقاط) to profiles, persisted and displayed in game
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_xp INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.total_xp IS 'Total points/XP earned from completing Tom & Jerry stages';

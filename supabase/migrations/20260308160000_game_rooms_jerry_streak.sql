-- Track how many times Jerry moved in the same direction consecutively.
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS last_jerry_streak INTEGER NOT NULL DEFAULT 0;


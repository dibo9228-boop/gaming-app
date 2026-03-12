-- Add category_id to quiz_battle_rooms for fetching questions by category (e.g. "play again").
ALTER TABLE public.quiz_battle_rooms
  ADD COLUMN IF NOT EXISTS category_id INTEGER;

COMMENT ON COLUMN public.quiz_battle_rooms.category_id IS 'Open Trivia DB category id; used to refetch questions on reset.';

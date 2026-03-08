-- Add columns for: Jerry can't repeat direction; Jerry wins after 50 Tom moves
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS last_jerry_direction JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tom_move_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.game_rooms.last_jerry_direction IS 'Last Jerry move {dx, dy}; Jerry cannot repeat this direction next move';
COMMENT ON COLUMN public.game_rooms.tom_move_count IS 'Number of moves Tom has made; Jerry wins when this reaches 50 without being caught';

-- Who can join: anyone with code, or invite-only (must have received an invite)
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'anyone' CHECK (join_policy IN ('anyone', 'invite_only'));

COMMENT ON COLUMN public.game_rooms.join_policy IS 'anyone = anyone with code can join; invite_only = only users with an invite can join';

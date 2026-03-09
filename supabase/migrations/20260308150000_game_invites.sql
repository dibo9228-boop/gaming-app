-- Invitations: send room invite to another user by username (display_name)
CREATE TABLE public.game_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(room_id, to_user_id)
);

ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invites sent to them" ON public.game_invites
  FOR SELECT USING (auth.uid() = to_user_id);

CREATE POLICY "Users can create invites (as sender)" ON public.game_invites
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Invitee can delete (accept/dismiss) their invite" ON public.game_invites
  FOR DELETE USING (auth.uid() = to_user_id);

CREATE POLICY "Sender can delete their invite" ON public.game_invites
  FOR DELETE USING (auth.uid() = from_user_id);

-- Realtime for invites so recipient sees new invites
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invites;

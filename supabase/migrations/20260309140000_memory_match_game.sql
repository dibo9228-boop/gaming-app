-- Memory Match game: progress, rooms, invites

CREATE TABLE public.memory_match_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  max_stage_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, difficulty)
);

ALTER TABLE public.memory_match_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their memory progress" ON public.memory_match_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can upsert their memory progress" ON public.memory_match_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their memory progress" ON public.memory_match_progress
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE public.memory_match_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deck JSONB NOT NULL,
  revealed_indices JSONB NOT NULL DEFAULT '[]',
  matched_indices JSONB NOT NULL DEFAULT '[]',
  host_score INTEGER NOT NULL DEFAULT 0,
  guest_score INTEGER NOT NULL DEFAULT 0,
  current_turn UUID,
  join_policy TEXT NOT NULL DEFAULT 'anyone' CHECK (join_policy IN ('anyone', 'invite_only')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'host_wins', 'guest_wins', 'draw')),
  invite_code TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_match_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view memory rooms they are part of" ON public.memory_match_rooms
  FOR SELECT USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting');
CREATE POLICY "Authenticated users can create memory rooms" ON public.memory_match_rooms
  FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Players can update memory rooms" ON public.memory_match_rooms
  FOR UPDATE
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting')
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id);
CREATE POLICY "Host can delete memory room" ON public.memory_match_rooms
  FOR DELETE USING (auth.uid() = host_id);

CREATE TABLE public.memory_match_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.memory_match_rooms(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (room_id, to_user_id)
);

ALTER TABLE public.memory_match_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view memory invites sent to them" ON public.memory_match_invites
  FOR SELECT USING (auth.uid() = to_user_id);
CREATE POLICY "Users can create memory invites" ON public.memory_match_invites
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Invitee can delete memory invite" ON public.memory_match_invites
  FOR DELETE USING (auth.uid() = to_user_id);
CREATE POLICY "Sender can delete memory invite" ON public.memory_match_invites
  FOR DELETE USING (auth.uid() = from_user_id);

CREATE TRIGGER update_memory_match_progress_updated_at
  BEFORE UPDATE ON public.memory_match_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_memory_match_rooms_updated_at
  BEFORE UPDATE ON public.memory_match_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.memory_match_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.memory_match_invites;


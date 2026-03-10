-- Quiz Battle game: progress, rooms, invites

CREATE TABLE public.quiz_battle_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  max_stage_completed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, difficulty)
);

ALTER TABLE public.quiz_battle_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quiz progress" ON public.quiz_battle_progress
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert quiz progress" ON public.quiz_battle_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update quiz progress" ON public.quiz_battle_progress
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TABLE public.quiz_battle_rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  questions JSONB NOT NULL,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  host_score INTEGER NOT NULL DEFAULT 0,
  guest_score INTEGER NOT NULL DEFAULT 0,
  host_answer_index INTEGER,
  guest_answer_index INTEGER,
  host_answered_at TIMESTAMP WITH TIME ZONE,
  guest_answered_at TIMESTAMP WITH TIME ZONE,
  question_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'host_wins', 'guest_wins', 'draw')),
  join_policy TEXT NOT NULL DEFAULT 'anyone' CHECK (join_policy IN ('anyone', 'invite_only')),
  invite_code TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_battle_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quiz rooms they are part of" ON public.quiz_battle_rooms
  FOR SELECT USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting');
CREATE POLICY "Authenticated users can create quiz rooms" ON public.quiz_battle_rooms
  FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Players can update quiz rooms" ON public.quiz_battle_rooms
  FOR UPDATE
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting')
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id);
CREATE POLICY "Host can delete quiz room" ON public.quiz_battle_rooms
  FOR DELETE USING (auth.uid() = host_id);

CREATE TABLE public.quiz_battle_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.quiz_battle_rooms(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (room_id, to_user_id)
);

ALTER TABLE public.quiz_battle_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quiz invites sent to them" ON public.quiz_battle_invites
  FOR SELECT USING (auth.uid() = to_user_id);
CREATE POLICY "Users can create quiz invites" ON public.quiz_battle_invites
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Invitee can delete quiz invite" ON public.quiz_battle_invites
  FOR DELETE USING (auth.uid() = to_user_id);
CREATE POLICY "Sender can delete quiz invite" ON public.quiz_battle_invites
  FOR DELETE USING (auth.uid() = from_user_id);

CREATE TRIGGER update_quiz_battle_progress_updated_at
  BEFORE UPDATE ON public.quiz_battle_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quiz_battle_rooms_updated_at
  BEFORE UPDATE ON public.quiz_battle_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_battle_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_battle_invites;


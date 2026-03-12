-- =============================================================
-- DROP EVERYTHING (reset clean)
-- =============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_game_rooms_updated_at ON public.game_rooms;
DROP TRIGGER IF EXISTS update_tom_jerry_progress_updated_at ON public.tom_jerry_progress;
DROP TRIGGER IF EXISTS update_memory_match_progress_updated_at ON public.memory_match_progress;
DROP TRIGGER IF EXISTS update_memory_match_rooms_updated_at ON public.memory_match_rooms;
DROP TRIGGER IF EXISTS update_quiz_battle_progress_updated_at ON public.quiz_battle_progress;
DROP TRIGGER IF EXISTS update_quiz_battle_rooms_updated_at ON public.quiz_battle_rooms;
DROP TRIGGER IF EXISTS update_user_game_stats_updated_at ON public.user_game_stats;

DROP TABLE IF EXISTS public.user_game_stats       CASCADE;
DROP TABLE IF EXISTS public.quiz_battle_invites   CASCADE;
DROP TABLE IF EXISTS public.quiz_battle_rooms     CASCADE;
DROP TABLE IF EXISTS public.quiz_battle_progress  CASCADE;
DROP TABLE IF EXISTS public.memory_match_invites  CASCADE;
DROP TABLE IF EXISTS public.memory_match_rooms    CASCADE;
DROP TABLE IF EXISTS public.memory_match_progress CASCADE;
DROP TABLE IF EXISTS public.game_invites          CASCADE;
DROP TABLE IF EXISTS public.tom_jerry_progress    CASCADE;
DROP TABLE IF EXISTS public.game_rooms            CASCADE;
DROP TABLE IF EXISTS public.profiles              CASCADE;

DROP FUNCTION IF EXISTS public.handle_new_user()        CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- =============================================================
-- UTILITY FUNCTIONS
-- =============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================================
-- PROFILES
-- =============================================================

CREATE TABLE public.profiles (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_url   TEXT,
  total_xp     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- USER GAME STATS (generic per-game XP table)
-- =============================================================

CREATE TABLE public.user_game_stats (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0,
  wins       INTEGER NOT NULL DEFAULT 0,
  plays      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

ALTER TABLE public.user_game_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own game stats"
  ON public.user_game_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own game stats"
  ON public.user_game_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own game stats"
  ON public.user_game_stats FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_user_game_stats_updated_at
  BEFORE UPDATE ON public.user_game_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- TOM & JERRY
-- =============================================================

CREATE TABLE public.game_rooms (
  id                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  grid                 JSONB NOT NULL,
  jerry_pos            JSONB NOT NULL DEFAULT '{"x":0,"y":0}',
  tom_pos              JSONB NOT NULL DEFAULT '{"x":9,"y":0}',
  exit_pos             JSONB NOT NULL DEFAULT '{"x":9,"y":9}',
  current_turn         UUID,
  host_role            TEXT NOT NULL DEFAULT 'jerry' CHECK (host_role IN ('jerry', 'tom')),
  status               TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'jerry_wins', 'tom_wins')),
  join_policy          TEXT NOT NULL DEFAULT 'anyone' CHECK (join_policy IN ('anyone', 'invite_only')),
  invite_code          TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  last_jerry_direction JSONB DEFAULT NULL,
  last_jerry_streak    INTEGER NOT NULL DEFAULT 0,
  tom_move_count       INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms they are part of"
  ON public.game_rooms FOR SELECT
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting');
CREATE POLICY "Authenticated users can create rooms"
  ON public.game_rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Players can update their rooms"
  ON public.game_rooms FOR UPDATE
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting')
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id);
CREATE POLICY "Host can delete room"
  ON public.game_rooms FOR DELETE USING (auth.uid() = host_id);

CREATE TRIGGER update_game_rooms_updated_at
  BEFORE UPDATE ON public.game_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.game_invites (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id      UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, to_user_id)
);

ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invites sent to them"
  ON public.game_invites FOR SELECT USING (auth.uid() = to_user_id);
CREATE POLICY "Users can create invites"
  ON public.game_invites FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Invitee can delete their invite"
  ON public.game_invites FOR DELETE USING (auth.uid() = to_user_id);
CREATE POLICY "Sender can delete their invite"
  ON public.game_invites FOR DELETE USING (auth.uid() = from_user_id);

CREATE TABLE public.tom_jerry_progress (
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  max_stage_completed INTEGER NOT NULL DEFAULT 0 CHECK (max_stage_completed >= 0 AND max_stage_completed <= 25),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, difficulty)
);

ALTER TABLE public.tom_jerry_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tom-jerry progress"
  ON public.tom_jerry_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tom-jerry progress"
  ON public.tom_jerry_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tom-jerry progress"
  ON public.tom_jerry_progress FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_tom_jerry_progress_updated_at
  BEFORE UPDATE ON public.tom_jerry_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- MEMORY MATCH
-- =============================================================

CREATE TABLE public.memory_match_progress (
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  max_stage_completed INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, difficulty)
);

ALTER TABLE public.memory_match_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their memory progress"
  ON public.memory_match_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their memory progress"
  ON public.memory_match_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their memory progress"
  ON public.memory_match_progress FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_memory_match_progress_updated_at
  BEFORE UPDATE ON public.memory_match_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.memory_match_rooms (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deck         JSONB NOT NULL,
  revealed_indices JSONB NOT NULL DEFAULT '[]',
  matched_indices  JSONB NOT NULL DEFAULT '[]',
  host_score   INTEGER NOT NULL DEFAULT 0,
  guest_score  INTEGER NOT NULL DEFAULT 0,
  current_turn UUID,
  join_policy  TEXT NOT NULL DEFAULT 'anyone' CHECK (join_policy IN ('anyone', 'invite_only')),
  status       TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'host_wins', 'guest_wins', 'draw')),
  invite_code  TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_match_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view memory rooms they are part of"
  ON public.memory_match_rooms FOR SELECT
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting');
CREATE POLICY "Authenticated users can create memory rooms"
  ON public.memory_match_rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Players can update memory rooms"
  ON public.memory_match_rooms FOR UPDATE
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting')
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id);
CREATE POLICY "Host can delete memory room"
  ON public.memory_match_rooms FOR DELETE USING (auth.uid() = host_id);

CREATE TRIGGER update_memory_match_rooms_updated_at
  BEFORE UPDATE ON public.memory_match_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.memory_match_invites (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id      UUID NOT NULL REFERENCES public.memory_match_rooms(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, to_user_id)
);

ALTER TABLE public.memory_match_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view memory invites sent to them"
  ON public.memory_match_invites FOR SELECT USING (auth.uid() = to_user_id);
CREATE POLICY "Users can create memory invites"
  ON public.memory_match_invites FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Invitee can delete memory invite"
  ON public.memory_match_invites FOR DELETE USING (auth.uid() = to_user_id);
CREATE POLICY "Sender can delete memory invite"
  ON public.memory_match_invites FOR DELETE USING (auth.uid() = from_user_id);

-- =============================================================
-- QUIZ BATTLE
-- =============================================================

CREATE TABLE public.quiz_battle_progress (
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  max_stage_completed INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, difficulty)
);

ALTER TABLE public.quiz_battle_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quiz progress"
  ON public.quiz_battle_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert quiz progress"
  ON public.quiz_battle_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update quiz progress"
  ON public.quiz_battle_progress FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_quiz_battle_progress_updated_at
  BEFORE UPDATE ON public.quiz_battle_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.quiz_battle_rooms (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  questions             JSONB NOT NULL,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  host_score            INTEGER NOT NULL DEFAULT 0,
  guest_score           INTEGER NOT NULL DEFAULT 0,
  host_answer_index     INTEGER,
  guest_answer_index    INTEGER,
  host_answered_at      TIMESTAMPTZ,
  guest_answered_at     TIMESTAMPTZ,
  question_started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  category_id           INTEGER,
  status                TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'host_wins', 'guest_wins', 'draw')),
  join_policy           TEXT NOT NULL DEFAULT 'anyone' CHECK (join_policy IN ('anyone', 'invite_only')),
  invite_code           TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_battle_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quiz rooms they are part of"
  ON public.quiz_battle_rooms FOR SELECT
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting');
CREATE POLICY "Authenticated users can create quiz rooms"
  ON public.quiz_battle_rooms FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Players can update quiz rooms"
  ON public.quiz_battle_rooms FOR UPDATE
  USING (auth.uid() = host_id OR auth.uid() = guest_id OR status = 'waiting')
  WITH CHECK (auth.uid() = host_id OR auth.uid() = guest_id);
CREATE POLICY "Host can delete quiz room"
  ON public.quiz_battle_rooms FOR DELETE USING (auth.uid() = host_id);

CREATE TRIGGER update_quiz_battle_rooms_updated_at
  BEFORE UPDATE ON public.quiz_battle_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.quiz_battle_invites (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id      UUID NOT NULL REFERENCES public.quiz_battle_rooms(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, to_user_id)
);

ALTER TABLE public.quiz_battle_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quiz invites sent to them"
  ON public.quiz_battle_invites FOR SELECT USING (auth.uid() = to_user_id);
CREATE POLICY "Users can create quiz invites"
  ON public.quiz_battle_invites FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Invitee can delete quiz invite"
  ON public.quiz_battle_invites FOR DELETE USING (auth.uid() = to_user_id);
CREATE POLICY "Sender can delete quiz invite"
  ON public.quiz_battle_invites FOR DELETE USING (auth.uid() = from_user_id);

-- =============================================================
-- REALTIME
-- =============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.memory_match_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.memory_match_invites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_battle_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_battle_invites;

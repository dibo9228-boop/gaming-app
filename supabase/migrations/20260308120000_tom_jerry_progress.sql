-- Tom & Jerry single-player stage progress per user and difficulty
CREATE TABLE public.tom_jerry_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  max_stage_completed INTEGER NOT NULL DEFAULT 0 CHECK (max_stage_completed >= 0 AND max_stage_completed <= 25),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, difficulty)
);

ALTER TABLE public.tom_jerry_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress" ON public.tom_jerry_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress" ON public.tom_jerry_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress" ON public.tom_jerry_progress
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_tom_jerry_progress_updated_at
  BEFORE UPDATE ON public.tom_jerry_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

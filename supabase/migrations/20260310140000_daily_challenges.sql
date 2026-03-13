-- Daily challenges: one global challenge per day for all users.
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL CHECK (game_type IN ('memory', 'quiz', 'tom_and_jerry')),
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('win_match', 'score_target', 'play_matches')),
  target_value INTEGER NOT NULL CHECK (target_value > 0),
  bonus_points INTEGER NOT NULL CHECK (bonus_points > 0),
  date DATE NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_daily_challenge_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, challenge_id)
);

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_challenge_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Daily challenges are readable by everyone"
  ON public.daily_challenges
  FOR SELECT
  USING (true);

CREATE POLICY "Users can read own daily progress"
  ON public.user_daily_challenge_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily progress"
  ON public.user_daily_challenge_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily progress"
  ON public.user_daily_challenge_progress
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ensure_daily_challenge(
  p_date DATE DEFAULT ((now() AT TIME ZONE 'UTC')::date)
)
RETURNS public.daily_challenges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.daily_challenges%ROWTYPE;
  v_pick INTEGER;
  v_day_seed INTEGER;
BEGIN
  SELECT * INTO v_existing
  FROM public.daily_challenges
  WHERE date = p_date;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- Deterministic daily rotation, same challenge for all users.
  v_day_seed := FLOOR(EXTRACT(EPOCH FROM p_date::timestamp) / 86400);
  v_pick := (v_day_seed % 6) + 1;

  INSERT INTO public.daily_challenges (game_type, challenge_type, target_value, bonus_points, date)
  VALUES (
    CASE
      WHEN v_pick IN (1, 4) THEN 'memory'
      WHEN v_pick IN (2, 5) THEN 'quiz'
      ELSE 'tom_and_jerry'
    END,
    CASE
      WHEN v_pick = 1 THEN 'win_match'
      WHEN v_pick = 2 THEN 'score_target'
      WHEN v_pick = 3 THEN 'win_match'
      ELSE 'play_matches'
    END,
    CASE
      WHEN v_pick = 1 THEN 1
      WHEN v_pick = 2 THEN 8
      WHEN v_pick = 3 THEN 2
      ELSE 2
    END,
    CASE
      WHEN v_pick = 1 THEN 100
      WHEN v_pick = 2 THEN 120
      WHEN v_pick = 3 THEN 150
      ELSE 90
    END,
    p_date
  )
  RETURNING * INTO v_existing;

  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_challenge_for_user(
  p_user_id UUID
)
RETURNS TABLE(
  challenge_id UUID,
  game_type TEXT,
  challenge_type TEXT,
  target_value INTEGER,
  bonus_points INTEGER,
  challenge_date DATE,
  progress INTEGER,
  completed BOOLEAN,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_challenge public.daily_challenges%ROWTYPE;
BEGIN
  v_challenge := public.ensure_daily_challenge(v_today);

  INSERT INTO public.user_daily_challenge_progress (user_id, challenge_id)
  VALUES (p_user_id, v_challenge.id)
  ON CONFLICT (user_id, challenge_id) DO NOTHING;

  RETURN QUERY
  SELECT
    v_challenge.id,
    v_challenge.game_type,
    v_challenge.challenge_type,
    v_challenge.target_value,
    v_challenge.bonus_points,
    v_challenge.date,
    COALESCE(p.progress, 0),
    COALESCE(p.completed, false),
    p.completed_at
  FROM public.user_daily_challenge_progress p
  WHERE p.user_id = p_user_id
    AND p.challenge_id = v_challenge.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_daily_challenge_progress(
  p_user_id UUID,
  p_game_type TEXT,
  p_win BOOLEAN DEFAULT false,
  p_score INTEGER DEFAULT 0,
  p_matches_played INTEGER DEFAULT 1
)
RETURNS TABLE(
  challenge_id UUID,
  progress INTEGER,
  target_value INTEGER,
  completed BOOLEAN,
  bonus_awarded INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_challenge public.daily_challenges%ROWTYPE;
  v_row public.user_daily_challenge_progress%ROWTYPE;
  v_new_progress INTEGER;
  v_bonus INTEGER := 0;
BEGIN
  v_challenge := public.ensure_daily_challenge(v_today);

  INSERT INTO public.user_daily_challenge_progress (user_id, challenge_id)
  VALUES (p_user_id, v_challenge.id)
  ON CONFLICT (user_id, challenge_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.user_daily_challenge_progress
  WHERE user_id = p_user_id
    AND challenge_id = v_challenge.id
  FOR UPDATE;

  IF v_challenge.game_type <> p_game_type THEN
    RETURN QUERY SELECT v_challenge.id, v_row.progress, v_challenge.target_value, v_row.completed, 0;
    RETURN;
  END IF;

  IF v_row.completed THEN
    RETURN QUERY SELECT v_challenge.id, v_row.progress, v_challenge.target_value, true, 0;
    RETURN;
  END IF;

  v_new_progress := v_row.progress;

  IF v_challenge.challenge_type = 'score_target' THEN
    v_new_progress := GREATEST(v_row.progress, GREATEST(COALESCE(p_score, 0), 0));
  ELSIF v_challenge.challenge_type = 'win_match' THEN
    IF COALESCE(p_win, false) THEN
      v_new_progress := v_row.progress + 1;
    END IF;
  ELSE
    v_new_progress := v_row.progress + GREATEST(COALESCE(p_matches_played, 1), 1);
  END IF;

  IF v_new_progress >= v_challenge.target_value THEN
    v_bonus := v_challenge.bonus_points;
    UPDATE public.user_daily_challenge_progress
    SET
      progress = v_new_progress,
      completed = true,
      completed_at = now()
    WHERE id = v_row.id;

    UPDATE public.profiles
    SET total_xp = total_xp + v_bonus
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT v_challenge.id, v_new_progress, v_challenge.target_value, true, v_bonus;
    RETURN;
  END IF;

  UPDATE public.user_daily_challenge_progress
  SET progress = v_new_progress
  WHERE id = v_row.id;

  RETURN QUERY SELECT v_challenge.id, v_new_progress, v_challenge.target_value, false, 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_daily_challenge(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_challenge_for_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_daily_challenge_progress(UUID, TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated;

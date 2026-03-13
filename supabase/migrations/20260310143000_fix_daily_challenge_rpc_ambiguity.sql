-- Fix ambiguous "challenge_id" references in daily challenge RPCs.
-- Cause: RETURNS TABLE output field names can conflict with SQL identifiers.

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
  ON CONFLICT ON CONSTRAINT user_daily_challenge_progress_user_id_challenge_id_key
  DO NOTHING;

  RETURN QUERY
  SELECT
    v_challenge.id AS challenge_id,
    v_challenge.game_type,
    v_challenge.challenge_type,
    v_challenge.target_value,
    v_challenge.bonus_points,
    v_challenge.date AS challenge_date,
    COALESCE(udp.progress, 0) AS progress,
    COALESCE(udp.completed, false) AS completed,
    udp.completed_at
  FROM public.user_daily_challenge_progress AS udp
  WHERE udp.user_id = p_user_id
    AND udp.challenge_id = v_challenge.id;
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
  ON CONFLICT ON CONSTRAINT user_daily_challenge_progress_user_id_challenge_id_key
  DO NOTHING;

  SELECT * INTO v_row
  FROM public.user_daily_challenge_progress AS udp
  WHERE udp.user_id = p_user_id
    AND udp.challenge_id = v_challenge.id
  FOR UPDATE;

  IF v_challenge.game_type <> p_game_type THEN
    RETURN QUERY
    SELECT v_challenge.id, v_row.progress, v_challenge.target_value, v_row.completed, 0;
    RETURN;
  END IF;

  IF v_row.completed THEN
    RETURN QUERY
    SELECT v_challenge.id, v_row.progress, v_challenge.target_value, true, 0;
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

    RETURN QUERY
    SELECT v_challenge.id, v_new_progress, v_challenge.target_value, true, v_bonus;
    RETURN;
  END IF;

  UPDATE public.user_daily_challenge_progress
  SET progress = v_new_progress
  WHERE id = v_row.id;

  RETURN QUERY
  SELECT v_challenge.id, v_new_progress, v_challenge.target_value, false, 0;
END;
$$;

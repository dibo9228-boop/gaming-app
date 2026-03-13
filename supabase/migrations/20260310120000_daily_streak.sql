-- Daily streak fields (global per user)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS streak_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_played_date DATE,
  ADD COLUMN IF NOT EXISTS streak_reward_claimed_today BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.streak_count IS 'Global daily streak count for the user.';
COMMENT ON COLUMN public.profiles.last_played_date IS 'Last date the user finished at least one game.';
COMMENT ON COLUMN public.profiles.streak_reward_claimed_today IS 'True once daily streak bonus was granted for the current date.';

CREATE OR REPLACE FUNCTION public.apply_game_rewards(
  p_user_id UUID,
  p_game_id TEXT,
  p_xp_delta INTEGER
)
RETURNS TABLE(
  streak_awarded BOOLEAN,
  streak_bonus INTEGER,
  streak_count INTEGER,
  total_xp INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_yesterday DATE := ((now() AT TIME ZONE 'UTC')::date - INTERVAL '1 day')::date;
  v_last_played DATE;
  v_current_streak INTEGER;
  v_bonus INTEGER := 0;
  v_total_xp INTEGER := 0;
  v_awarded BOOLEAN := false;
BEGIN
  IF p_xp_delta <= 0 THEN
    SELECT COALESCE(pr.streak_count, 0), COALESCE(pr.total_xp, 0)
      INTO v_current_streak, v_total_xp
    FROM public.profiles pr
    WHERE pr.user_id = p_user_id;

    RETURN QUERY SELECT false, 0, COALESCE(v_current_streak, 0), COALESCE(v_total_xp, 0);
    RETURN;
  END IF;

  -- Ensure profile row exists, then lock it to make reward idempotent under concurrent calls.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    INSERT INTO public.profiles (user_id, display_name, total_xp, streak_count)
    VALUES (p_user_id, 'player-' || left(p_user_id::text, 8), 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  SELECT pr.last_played_date, COALESCE(pr.streak_count, 0), COALESCE(pr.total_xp, 0)
    INTO v_last_played, v_current_streak, v_total_xp
  FROM public.profiles pr
  WHERE pr.user_id = p_user_id
  FOR UPDATE;

  -- Always grant base game XP.
  v_total_xp := v_total_xp + p_xp_delta;

  -- Daily streak logic (counted only first finished game of the day).
  IF v_last_played IS DISTINCT FROM v_today THEN
    IF v_last_played = v_yesterday THEN
      v_current_streak := v_current_streak + 1;
    ELSE
      v_current_streak := 1;
    END IF;

    v_bonus := v_current_streak * 10;
    v_total_xp := v_total_xp + v_bonus;
    v_awarded := true;
  END IF;

  UPDATE public.profiles
  SET
    total_xp = v_total_xp,
    streak_count = v_current_streak,
    last_played_date = CASE
      WHEN v_awarded THEN v_today
      ELSE last_played_date
    END,
    streak_reward_claimed_today = CASE
      WHEN v_awarded THEN true
      WHEN last_played_date = v_today THEN true
      ELSE false
    END
  WHERE user_id = p_user_id;

  INSERT INTO public.user_game_stats (user_id, game_id, xp)
  VALUES (p_user_id, p_game_id, p_xp_delta)
  ON CONFLICT (user_id, game_id)
  DO UPDATE SET
    xp = public.user_game_stats.xp + EXCLUDED.xp,
    updated_at = now();

  RETURN QUERY
  SELECT v_awarded, v_bonus, v_current_streak, v_total_xp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_game_rewards(UUID, TEXT, INTEGER) TO authenticated;

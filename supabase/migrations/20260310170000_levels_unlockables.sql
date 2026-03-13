-- Levels + Unlockables system

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

-- Backfill from current total points if xp was not tracked previously.
UPDATE public.profiles
SET xp = GREATEST(COALESCE(total_xp, 0), 0)
WHERE xp = 0;

CREATE TABLE IF NOT EXISTS public.user_unlockables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unlockable_type TEXT NOT NULL CHECK (unlockable_type IN ('avatar', 'game', 'theme', 'challenge', 'badge')),
  unlockable_code TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, unlockable_code)
);

ALTER TABLE public.user_unlockables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own unlockables"
  ON public.user_unlockables
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own unlockables"
  ON public.user_unlockables
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_level_from_xp(p_xp INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_xp >= 2100 THEN RETURN 7; END IF;
  IF p_xp >= 1500 THEN RETURN 6; END IF;
  IF p_xp >= 1000 THEN RETURN 5; END IF;
  IF p_xp >= 600 THEN RETURN 4; END IF;
  IF p_xp >= 300 THEN RETURN 3; END IF;
  IF p_xp >= 100 THEN RETURN 2; END IF;
  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_level_unlockables(
  p_user_id UUID,
  p_level INTEGER
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unlocked TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_level >= 4 THEN
    INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
    VALUES (p_user_id, 'challenge', 'challenge_fast_mode')
    ON CONFLICT (user_id, unlockable_code) DO NOTHING;
    IF FOUND THEN v_unlocked := array_append(v_unlocked, 'تحديات أسرع'); END IF;
  END IF;

  IF p_level >= 5 THEN
    INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
    VALUES (p_user_id, 'game', 'game_small_tournament')
    ON CONFLICT (user_id, unlockable_code) DO NOTHING;
    IF FOUND THEN v_unlocked := array_append(v_unlocked, 'بطولات صغيرة'); END IF;
  END IF;

  IF p_level >= 6 THEN
    INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
    VALUES (p_user_id, 'theme', 'theme_neon_pro')
    ON CONFLICT (user_id, unlockable_code) DO NOTHING;
    IF FOUND THEN v_unlocked := array_append(v_unlocked, 'ثيم Neon Pro'); END IF;
  END IF;

  IF p_level >= 7 THEN
    INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
    VALUES
      (p_user_id, 'avatar', 'avatar_legend'),
      (p_user_id, 'badge', 'badge_elite'),
      (p_user_id, 'challenge', 'challenge_exclusive')
    ON CONFLICT (user_id, unlockable_code) DO NOTHING;

    IF EXISTS (
      SELECT 1 FROM public.user_unlockables
      WHERE user_id = p_user_id AND unlockable_code = 'avatar_legend'
    ) THEN
      v_unlocked := array_append(v_unlocked, 'أفاتار أسطوري');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.user_unlockables
      WHERE user_id = p_user_id AND unlockable_code = 'badge_elite'
    ) THEN
      v_unlocked := array_append(v_unlocked, 'شارة Elite');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.user_unlockables
      WHERE user_id = p_user_id AND unlockable_code = 'challenge_exclusive'
    ) THEN
      v_unlocked := array_append(v_unlocked, 'تحديات حصرية');
    END IF;
  END IF;

  RETURN v_unlocked;
END;
$$;

-- keep levels consistent for existing users
UPDATE public.profiles
SET level = public.get_level_from_xp(xp);

-- backfill unlockables for existing users by their current level
INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
SELECT p.user_id, 'challenge', 'challenge_fast_mode'
FROM public.profiles p
WHERE p.level >= 4
ON CONFLICT (user_id, unlockable_code) DO NOTHING;

INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
SELECT p.user_id, 'game', 'game_small_tournament'
FROM public.profiles p
WHERE p.level >= 5
ON CONFLICT (user_id, unlockable_code) DO NOTHING;

INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
SELECT p.user_id, 'theme', 'theme_neon_pro'
FROM public.profiles p
WHERE p.level >= 6
ON CONFLICT (user_id, unlockable_code) DO NOTHING;

INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
SELECT p.user_id, 'avatar', 'avatar_legend'
FROM public.profiles p
WHERE p.level >= 7
ON CONFLICT (user_id, unlockable_code) DO NOTHING;

INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
SELECT p.user_id, 'badge', 'badge_elite'
FROM public.profiles p
WHERE p.level >= 7
ON CONFLICT (user_id, unlockable_code) DO NOTHING;

INSERT INTO public.user_unlockables (user_id, unlockable_type, unlockable_code)
SELECT p.user_id, 'challenge', 'challenge_exclusive'
FROM public.profiles p
WHERE p.level >= 7
ON CONFLICT (user_id, unlockable_code) DO NOTHING;

-- Required because return type changed vs older apply_game_rewards definition.
DROP FUNCTION IF EXISTS public.apply_game_rewards(UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.apply_game_rewards(
  p_user_id UUID,
  p_game_id TEXT,
  p_xp_delta INTEGER
)
RETURNS TABLE(
  streak_awarded BOOLEAN,
  streak_bonus INTEGER,
  streak_count INTEGER,
  total_xp INTEGER,
  xp INTEGER,
  level INTEGER,
  level_up BOOLEAN,
  unlocked_features TEXT[]
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
  v_xp INTEGER := 0;
  v_prev_level INTEGER := 1;
  v_new_level INTEGER := 1;
  v_awarded BOOLEAN := false;
  v_level_up BOOLEAN := false;
  v_unlocked TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_xp_delta <= 0 THEN
    SELECT COALESCE(pr.streak_count, 0), COALESCE(pr.total_xp, 0), COALESCE(pr.xp, 0), COALESCE(pr.level, 1)
      INTO v_current_streak, v_total_xp, v_xp, v_prev_level
    FROM public.profiles pr
    WHERE pr.user_id = p_user_id;

    RETURN QUERY SELECT false, 0, COALESCE(v_current_streak, 0), COALESCE(v_total_xp, 0), COALESCE(v_xp, 0), COALESCE(v_prev_level, 1), false, ARRAY[]::TEXT[];
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    INSERT INTO public.profiles (user_id, display_name, total_xp, streak_count, xp, level)
    VALUES (p_user_id, 'player-' || left(p_user_id::text, 8), 0, 0, 0, 1)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  SELECT pr.last_played_date, COALESCE(pr.streak_count, 0), COALESCE(pr.total_xp, 0), COALESCE(pr.xp, 0), COALESCE(pr.level, 1)
    INTO v_last_played, v_current_streak, v_total_xp, v_xp, v_prev_level
  FROM public.profiles pr
  WHERE pr.user_id = p_user_id
  FOR UPDATE;

  v_total_xp := v_total_xp + p_xp_delta;
  v_xp := v_xp + p_xp_delta;

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

  v_new_level := public.get_level_from_xp(v_xp);
  v_level_up := v_new_level > v_prev_level;

  UPDATE public.profiles
  SET
    total_xp = v_total_xp,
    xp = v_xp,
    level = v_new_level,
    streak_count = v_current_streak,
    last_played_date = CASE WHEN v_awarded THEN v_today ELSE last_played_date END,
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

  IF v_level_up THEN
    v_unlocked := public.grant_level_unlockables(p_user_id, v_new_level);
  END IF;

  RETURN QUERY
  SELECT v_awarded, v_bonus, v_current_streak, v_total_xp, v_xp, v_new_level, v_level_up, v_unlocked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_level_from_xp(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_level_unlockables(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_game_rewards(UUID, TEXT, INTEGER) TO authenticated;

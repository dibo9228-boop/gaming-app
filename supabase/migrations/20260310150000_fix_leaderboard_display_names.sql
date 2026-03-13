-- Fix wrong/placeholder profile names used in leaderboard.
-- Populate profile display_name from auth metadata/email when empty or placeholder.

UPDATE public.profiles AS p
SET display_name = COALESCE(
  NULLIF(BTRIM(u.raw_user_meta_data->>'display_name'), ''),
  NULLIF(BTRIM(u.raw_user_meta_data->>'full_name'), ''),
  split_part(u.email, '@', 1)
)
FROM auth.users AS u
WHERE p.user_id = u.id
  AND (
    p.display_name IS NULL
    OR BTRIM(p.display_name) = ''
    OR p.display_name LIKE 'player-%'
    OR p.display_name = 'لاعب مجهول'
  );

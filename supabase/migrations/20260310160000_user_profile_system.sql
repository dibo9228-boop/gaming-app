-- User Profile System: profile color, unique display names, avatar storage policies.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_color TEXT;

-- Normalize duplicate display names before adding unique index.
WITH ranked AS (
  SELECT
    id,
    display_name,
    ROW_NUMBER() OVER (
      PARTITION BY lower(btrim(display_name))
      ORDER BY created_at, id
    ) AS rn
  FROM public.profiles
  WHERE btrim(COALESCE(display_name, '')) <> ''
)
UPDATE public.profiles p
SET display_name = p.display_name || '_' || ranked.rn
FROM ranked
WHERE p.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_unique_idx
  ON public.profiles ((lower(btrim(display_name))))
  WHERE btrim(COALESCE(display_name, '')) <> '';

-- Keep signup trigger compatible with unique display names.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_base_name TEXT;
  v_final_name TEXT;
  v_counter INTEGER := 1;
BEGIN
  v_base_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    split_part(NEW.email, '@', 1)
  );
  v_final_name := v_base_name;

  WHILE EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(btrim(p.display_name)) = lower(btrim(v_final_name))
  ) LOOP
    v_counter := v_counter + 1;
    v_final_name := v_base_name || '_' || v_counter;
  END LOOP;

  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, v_final_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Public bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Avatar images are public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users upload own avatars"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own avatars"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own avatars"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

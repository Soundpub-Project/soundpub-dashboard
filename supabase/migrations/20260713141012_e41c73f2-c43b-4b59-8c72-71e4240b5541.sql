CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _provider text;
  _default_label uuid := '3938c13d-f8f7-47ff-8e7f-6a3a8535e894';
BEGIN
  _provider := NEW.raw_app_meta_data ->> 'provider';

  INSERT INTO public.profiles (id, email, full_name, password_set, sso_provider, artist_profile_completed, parent_label_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    CASE WHEN _provider = 'google' THEN false ELSE COALESCE((NEW.raw_user_meta_data ->> 'password_set')::boolean, true) END,
    CASE WHEN _provider = 'google' THEN 'google' ELSE NULL END,
    false,
    _default_label
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'artist');

  RETURN NEW;
END;
$function$;
-- Fonction RPC pour vérifier si un utilisateur Supabase existe.
-- Lorsque les deux paramètres sont fournis, vérifie que email ET téléphone
-- appartiennent au MÊME utilisateur (logique AND).
-- À exécuter dans l'éditeur SQL de votre projet Supabase.

create or replace function public.check_auth_user_exists(
  p_email text default null,
  p_phone text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Les deux fournis → même utilisateur (AND)
  if p_email is not null and p_email <> '' and p_phone is not null and p_phone <> '' then
    return exists (
      select 1 from auth.users
      where lower(email) = lower(p_email)
        and raw_user_meta_data->>'phone' = p_phone
    );
  end if;

  -- Email seul
  if p_email is not null and p_email <> '' then
    return exists (
      select 1 from auth.users where lower(email) = lower(p_email)
    );
  end if;

  -- Téléphone seul
  if p_phone is not null and p_phone <> '' then
    return exists (
      select 1 from auth.users where raw_user_meta_data->>'phone' = p_phone
    );
  end if;

  return false;
end;
$$;

grant execute on function public.check_auth_user_exists to anon, authenticated;

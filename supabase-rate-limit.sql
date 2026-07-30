-- ============================================
-- LIMITATION DE DÉBIT SUR check_auth_user_exists
-- À exécuter dans Supabase > SQL Editor
-- ============================================
-- `check_auth_user_exists` est un oracle d'énumération : accessible à `anon`,
-- elle dit si un email ou un téléphone correspond à un compte. On garde la
-- fonctionnalité (retour immédiat dans le formulaire d'inscription) mais on
-- plafonne le nombre d'appels par adresse IP.
--
-- Important : les « Rate Limits » du dashboard Supabase ne s'appliquent PAS
-- ici. Ils protègent les endpoints d'authentification (GoTrue) ; cette RPC est
-- servie par PostgREST. D'où ce plafonnement côté base.

-- ============================================
-- 1. COMPTEURS
-- ============================================

CREATE TABLE IF NOT EXISTS public.rpc_rate_limit (
    bucket       TEXT        NOT NULL,
    client_key   TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    hits         INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, client_key, window_start)
);

-- Aucune policy : RLS activé sans policy = table inaccessible via l'API.
-- Seules les fonctions SECURITY DEFINER ci-dessous y touchent.
ALTER TABLE public.rpc_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rpc_rate_limit_window
    ON public.rpc_rate_limit(window_start);

-- ============================================
-- 2. IDENTIFICATION DE L'APPELANT
-- ============================================

CREATE OR REPLACE FUNCTION public.request_client_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_headers JSON;
    v_ip      TEXT;
BEGIN
    -- Hors PostgREST (SQL Editor, cron…), l'entête n'existe pas
    BEGIN
        v_headers := current_setting('request.headers', TRUE)::JSON;
    EXCEPTION WHEN OTHERS THEN
        RETURN 'local';
    END;

    IF v_headers IS NULL THEN
        RETURN 'local';
    END IF;

    v_ip := split_part(COALESCE(v_headers ->> 'x-forwarded-for', ''), ',', 1);
    v_ip := NULLIF(BTRIM(v_ip), '');

    RETURN COALESCE(v_ip, 'unknown');
END;
$$;

-- ============================================
-- 3. PLAFONNEMENT
-- ============================================
-- Lève une exception si le quota est dépassé sur la fenêtre courante.

CREATE OR REPLACE FUNCTION public.enforce_rate_limit(
    p_bucket  TEXT,
    p_limit   INTEGER,
    p_seconds INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key    TEXT;
    v_window TIMESTAMPTZ;
    v_hits   INTEGER;
BEGIN
    v_key := public.request_client_key();

    -- Début de la fenêtre glissante, aligné sur des tranches de p_seconds
    v_window := to_timestamp(
        FLOOR(EXTRACT(EPOCH FROM now()) / p_seconds) * p_seconds
    );

    INSERT INTO public.rpc_rate_limit (bucket, client_key, window_start, hits)
    VALUES (p_bucket, v_key, v_window, 1)
    ON CONFLICT (bucket, client_key, window_start)
    DO UPDATE SET hits = public.rpc_rate_limit.hits + 1
    RETURNING hits INTO v_hits;

    -- Purge opportuniste, pour ne pas laisser la table croître indéfiniment
    IF random() < 0.01 THEN
        DELETE FROM public.rpc_rate_limit WHERE window_start < now() - INTERVAL '1 day';
    END IF;

    IF v_hits > p_limit THEN
        RAISE EXCEPTION 'Trop de requêtes. Réessayez dans quelques instants.'
            USING ERRCODE = 'P0005';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;

-- ============================================
-- 4. APPLICATION À check_auth_user_exists
-- ============================================
-- Corps inchangé : seuls les deux appels de plafonnement sont ajoutés en tête.
--
-- Quotas volontairement larges : en Afrique de l'Ouest et centrale, une grande
-- partie du trafic mobile sort derrière du CGNAT, donc de nombreuses clientes
-- partagent une même IP publique. Trop serrer bloquerait de vraies inscriptions.

CREATE OR REPLACE FUNCTION public.check_auth_user_exists(
  p_email text default null,
  p_phone text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 20 appels / minute pour absorber une rafale, 150 / heure pour casser
  -- l'énumération sur la durée.
  perform public.enforce_rate_limit('check_auth_user_exists_burst', 20, 60);
  perform public.enforce_rate_limit('check_auth_user_exists_hour', 150, 3600);

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

-- ============================================
-- 5. VÉRIFICATIONS
-- ============================================
-- Depuis le SQL Editor, la clé vaut 'local' : inutile d'y chercher un blocage.
--
-- Compteurs observés en production :
--   SELECT bucket, client_key, window_start, hits
--   FROM public.rpc_rate_limit
--   ORDER BY window_start DESC LIMIT 20;
--
-- Pour débloquer une IP à la main :
--   DELETE FROM public.rpc_rate_limit WHERE client_key = '<ip>';
--
-- Pour ajuster les quotas, rejouer la section 4 avec d'autres valeurs.

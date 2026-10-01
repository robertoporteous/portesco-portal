-- 0011 — is_admin() también acepta role = 'admin' (Sprint 4 T9, 1 oct 2026)
--
-- Síntoma: el admin entra a /admin (proxy.ts deja pasar si is_admin OR
-- role = 'admin') pero los selects vuelven vacíos (colegios, noticias) porque
-- las policies usan is_admin(), que solo miraba users.is_admin. Un usuario con
-- role = 'admin' e is_admin = false pasaba la puerta y no veía nada.
--
-- Fix: una sola definición de "admin" para la app y para RLS. Idempotente.
-- Las policies existentes no cambian: todas llaman a esta función.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select u.is_admin or u.role = 'admin'
       from public.users u
      where u.id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to authenticated;

-- Verificación (Studio): quiénes son admin según la nueva regla.
select email, role, is_admin
from public.users
where is_admin or role = 'admin'
order by email;

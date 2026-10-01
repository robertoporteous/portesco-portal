-- Da rol admin a un usuario que ya existe en auth.users (1 oct 2026).
-- Caso: rporteous@portescosports.com entra con magic link pero NO tiene fila
-- en public.users → proxy.ts lo deja pasar a /admin ("sin perfil aún") y RLS
-- (is_admin()) le devuelve todo vacío. Idempotente.
-- Correr en Studio: pbcopy < este archivo → ⌘A Delete ⌘V → Run.

insert into public.users (id, email, full_name, role, is_admin, is_active)
select au.id,
       au.email,
       coalesce(au.raw_user_meta_data->>'full_name', 'Roberto Porteous'),
       'admin',
       true,
       true
from auth.users au
where lower(au.email) = 'rporteous@portescosports.com'
on conflict (id) do update
  set role = 'admin', is_admin = true, is_active = true;

select email, role, is_admin, is_active
from public.users
where is_admin or role = 'admin'
order by email;

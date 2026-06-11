-- 0009_users_coordinator_sees_staff.sql
-- PORTESCO Portal — Sprint 2 Bloque 3, RLS deuda §12
--
-- NUMERACIÓN: 0009 es el próximo número libre (0001-0008 ocupados; 0008 fue el
-- hot fix de Bloque 1). Architecture §16 y la memoria habían reservado "0009"
-- para el batch multi-region de Sprint 3 — esa migración corre ahora a 0010+.
--
-- QUÉ HACE:
--   Agrega una SELECT policy en `users` para que un coordinator pueda leer las
--   filas de STAFF (coordinator/professor) de SUS escuelas. La COLA del
--   Coordinator Pad (Bloque 3) muestra "voice notes de Alexander pendientes" y
--   necesita users.full_name del profesor — hoy un coordinator solo se ve a sí
--   mismo (policies de 0002/0004: admin / self / parent-sees-professors).
--
-- LEAK VECTOR (crítico — data de menores + PII de padres):
--   `users` también contiene a los PADRES (role='parent'), con email + phone.
--   Una SELECT policy da acceso a la FILA COMPLETA, no solo a full_name. Por eso
--   el helper filtra `role in ('coordinator','professor')` de forma explícita y
--   defensiva: NINGUNA fila de parent puede salir por esta policy. Un caller que
--   NO es coordinator (parent/professor) obtiene conjunto vacío de
--   user_school_ids_as_coordinator() → la policy no matchea nada → sin leak.
--   COLUMNAS DE STAFF EXPUESTAS: full_name, email, phone, role, etc. del staff
--   de la propia escuela quedan visibles al coordinator.
--   DECISIÓN ROBERTO (11 jun 2026) — ACEPTADO: los profesores son servicios
--   profesionales (contratistas), NO menores. FERPA/GDPR protegen data de
--   ESTUDIANTES, no el contacto de un staff visible a su propio coordinador.
--   Exponer email/phone de staff a su coordinador de escuela es aceptable.
--   Deuda de minimización column-level (una VIEW id+full_name) anotada en
--   Architecture §16.5 — NO se construye ahora (RLS es row-level, no column-level).
--
-- RECURSIÓN (§9): la policy NO usa EXISTS/IN(SELECT) directo contra otra tabla.
--   Toda la lógica vive en un helper SECURITY DEFINER (language sql, stable) que
--   bypassa el RLS interno — incluso seleccionando de `users` dentro de una
--   policy de `users` (mismo patrón probado que coordinator_school_student_ids()
--   en 0004, que selecciona de students y se usa en una policy de students).
--   ORDEN: el helper (language sql, resuelve identifiers en CREATE) va ANTES de
--   la policy que lo usa. Todas las tablas referenciadas ya existen.

begin;

-- Helper: user_ids de staff (coordinator/professor) de las escuelas donde el
-- caller es coordinator. Reúne dos vínculos staff↔escuela del schema:
--   a) staff_schools  (coordinators, y professors asignados a nivel escuela)
--   b) staff_activities → activities.school_id  (professors por actividad)
-- Reutiliza user_school_ids_as_coordinator() (0004) para "mis escuelas".
create or replace function public.coordinator_school_staff_user_ids()
returns setof uuid
language sql security definer set search_path = public stable
as $$
  select u.id
  from public.users u
  where u.role in ('coordinator', 'professor')
    and (
      u.id in (
        select ss.user_id
        from public.staff_schools ss
        where ss.school_id in (select public.user_school_ids_as_coordinator())
      )
      or u.id in (
        select sa.user_id
        from public.staff_activities sa
        join public.activities a on a.id = sa.activity_id
        where a.school_id in (select public.user_school_ids_as_coordinator())
      )
    );
$$;

revoke execute on function public.coordinator_school_staff_user_ids() from public;
grant  execute on function public.coordinator_school_staff_user_ids() to authenticated;

-- SELECT policy (permissive → OR con admin/self/parent-sees-professors).
-- Solo agrega visibilidad a coordinators; no toca a parents ni professors.
drop policy if exists "users: coordinator sees own-school staff" on users;
create policy "users: coordinator sees own-school staff"
  on users for select
  to authenticated
  using (id in (select public.coordinator_school_staff_user_ids()));

commit;

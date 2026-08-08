-- 014_profiles_rls_recursion_fix.sql
-- Arregla la recursión infinita (42P17) de las policies de public.profiles.
--
-- Causa: las 3 policies (select/update/delete) preguntaban "¿soy Admin?" con un
--   exists (select 1 from public.profiles where user_id = auth.uid() and role = 'Admin')
-- DENTRO de una policy de la propia tabla profiles: evaluar la policy exige leer profiles,
-- lo que vuelve a evaluar la policy, y así -> "infinite recursion detected in policy for
-- relation profiles". El resto de la app no se caía porque todas las demás tablas filtran
-- vía visible_profile_ids() (SECURITY DEFINER, se salta RLS), pero cualquier lectura
-- DIRECTA de profiles desde el cliente fallaba -> "Perfiles del hogar" en Ajustes salía
-- vacío (issue conocido desde 2026-06-23).
--
-- Fix: mover el chequeo de Admin a una función SECURITY DEFINER (is_admin), que lee
-- profiles sin re-evaluar RLS — mismo patrón que ya usa visible_profile_ids(). Las reglas
-- de negocio quedan idénticas: cada quien ve/edita su propio perfil, y un Admin ve/edita
-- todos; borrar sigue siendo solo-Admin y nunca sobre sí mismo.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'Admin'
  )
$$;

-- Se deja ejecutable también por anon: la policy de SELECT la invoca en CUALQUIER lectura
-- de profiles, y si el rol no tuviera EXECUTE la consulta fallaría con "permission denied"
-- en vez de devolver simplemente 0 filas.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete using (public.is_admin() and user_id is distinct from auth.uid());

-- 013_ensure_month_budgets_auth_guard.sql
-- Hardening: ensure_month_budgets es SECURITY DEFINER y se invoca por RPC desde el cliente
-- con un p_profile_id arbitrario, así que un usuario autenticado podía materializar filas de
-- category_budgets para las categorías de OTRO perfil, saltándose el visible_profile_ids()
-- que gatea el resto de la app. Se agrega un guard de autorización. auth.uid() resuelve al
-- usuario que llama aún dentro de SECURITY DEFINER (lee los claims del JWT, no el rol), así
-- que el visible_profile_ids() anidado es correcto. Los Admin ven todos los perfiles del
-- hogar (por visible_profile_ids), así que un Admin materializando cualquier perfil sigue
-- funcionando. Cuerpo idéntico a la migración 012 salvo el guard agregado al inicio.
create or replace function public.ensure_month_budgets(p_profile_id uuid, p_month date)
returns void
language plpgsql security definer
as $$
begin
  -- Solo materializar presupuestos para un perfil que el usuario actual puede ver.
  if p_profile_id not in (select public.visible_profile_ids()) then
    return;
  end if;

  insert into public.category_budgets (category_id, month, assigned, spent)
  select
    c.id,
    p_month,
    coalesce((
      select cb.assigned from public.category_budgets cb
      where cb.category_id = c.id and cb.month < p_month
      order by cb.month desc limit 1
    ), 0),
    0
  from public.categories c
  where c.profile_id = p_profile_id and c.active = true
  on conflict (category_id, month) do nothing;
end;
$$;

-- Genera automáticamente los movimientos de compromisos "PAC" (pago automático de cuentas,
-- ej. donaciones) el día del mes que corresponde, SIN depender de que llegue una notificación
-- del banco. Encontrado 2026-09-11: PAC Bomberos de Ñuñoa ($3.000) y PAC Protectora de la
-- Infancia ($15.000) no generan notificación al celular -- confiar en la ingesta automática los
-- deja silenciosamente afuera de Norte cada mes.
--
-- Identidad de un PAC recurrente: profile_id + name + payment_method='PAC'. La fila de
-- monthly_commitments del mes más reciente para esa identidad se usa como "plantilla"
-- (categoría/cuenta/monto/día pueden cambiar mes a mes si el usuario edita esa fila).
create or replace function public.run_pac_auto_charges()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Santiago')::date;
  cur_month date := date_trunc('month', today)::date;
  r record;
  new_tx_id uuid;
  existing_id uuid;
  existing_open boolean;
begin
  for r in
    select distinct on (mc.profile_id, mc.name)
      mc.profile_id, mc.name, mc.category_id, mc.account_id, mc.group_name,
      mc.expected_amount, mc.due_day, mc.payment_method, mc.matcher_hint
    from monthly_commitments mc
    where mc.payment_method = 'PAC'
      and mc.due_day = extract(day from today)::int
    order by mc.profile_id, mc.name, mc.month desc
  loop
    select id into existing_id from monthly_commitments
      where profile_id = r.profile_id and name = r.name and month = cur_month
      limit 1;

    if existing_id is not null then
      -- Ya hay fila este mes (ej. el usuario usó "Traer mes anterior"): generar el movimiento
      -- solo si todavía no está resuelta, para no duplicar si el job corre más de una vez el
      -- mismo día o si ya se vinculó a mano.
      select (paid_transaction_id is null and status not in ('pagado', 'omitido', 'sin_gasto'))
        into existing_open
        from monthly_commitments where id = existing_id;
      if not existing_open then
        continue;
      end if;

      insert into transactions (profile_id, name, amount, type, category_id, account_id, description, source, date)
      values (r.profile_id, r.name, -r.expected_amount, 'gasto', r.category_id, r.account_id,
              'Generado automáticamente (PAC día ' || r.due_day || ')', 'pac_auto', today)
      returning id into new_tx_id;

      update monthly_commitments
        set status = 'pagado', actual_amount = r.expected_amount, paid_transaction_id = new_tx_id
        where id = existing_id;
    else
      -- No existe fila este mes -> crearla ya resuelta junto con el movimiento, sin depender de
      -- que el usuario haya traído los compromisos del mes anterior antes del día de cobro.
      insert into transactions (profile_id, name, amount, type, category_id, account_id, description, source, date)
      values (r.profile_id, r.name, -r.expected_amount, 'gasto', r.category_id, r.account_id,
              'Generado automáticamente (PAC día ' || r.due_day || ')', 'pac_auto', today)
      returning id into new_tx_id;

      insert into monthly_commitments (profile_id, category_id, account_id, name, group_name,
        expected_amount, due_day, payment_method, matcher_hint, status, actual_amount, paid_transaction_id, month)
      values (r.profile_id, r.category_id, r.account_id, r.name, r.group_name,
        r.expected_amount, r.due_day, r.payment_method, r.matcher_hint, 'pagado', r.expected_amount, new_tx_id, cur_month);
    end if;
  end loop;
end;
$$;

create extension if not exists pg_cron;

select cron.schedule(
  'pac-auto-charges-daily',
  '0 13 * * *', -- 13:00 UTC = 09:00-10:00 Chile según horario de verano/invierno; siempre cae dentro del día correcto
  $$select public.run_pac_auto_charges();$$
);

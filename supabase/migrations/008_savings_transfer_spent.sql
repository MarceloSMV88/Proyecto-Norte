-- sync_category_spent solo sumaba movimientos type='gasto'. Los aportes a ahorro que se
-- registran como transferencia interna entre 2 cuentas propias (ej. Cuotas de Participación
-- Coopeuch: Monedero Digital -> Cuotas Participación, ambas patas con la misma categoría
-- "Ahorro - Personal") nunca se contaban en el presupuesto porque son type='transfer', no 'gasto'.
-- Fix: también cuenta la pata POSITIVA (dinero que llega al destino de ahorro) de una
-- transferencia categorizada, sin duplicar contando ambas patas (la pata negativa de origen
-- se ignora a propósito).
create or replace function public.sync_category_spent()
returns trigger
language plpgsql
security definer
as $function$
declare
  v_cat_id uuid;
  v_month  date;
  v_spent  bigint;
begin
  if TG_OP = 'DELETE' then
    v_cat_id := OLD.category_id;
    v_month  := date_trunc('month', OLD.date);
  else
    v_cat_id := NEW.category_id;
    v_month  := date_trunc('month', NEW.date);
  end if;

  if v_cat_id is null then
    return coalesce(NEW, OLD);
  end if;

  select coalesce(sum(abs(amount)), 0)
    into v_spent
    from public.transactions
   where category_id = v_cat_id
     and (type = 'gasto' or (type = 'transfer' and amount > 0))
     and date_trunc('month', date) = v_month;

  update public.categories
     set spent = v_spent
   where id = v_cat_id
     and month = v_month;

  if TG_OP = 'UPDATE' and OLD.category_id is not null and OLD.category_id <> NEW.category_id then
    select coalesce(sum(abs(amount)), 0)
      into v_spent
      from public.transactions
     where category_id = OLD.category_id
       and (type = 'gasto' or (type = 'transfer' and amount > 0))
       and date_trunc('month', date) = date_trunc('month', OLD.date);

    update public.categories
       set spent = v_spent
     where id = OLD.category_id
       and month = date_trunc('month', OLD.date);
  end if;

  return coalesce(NEW, OLD);
end;
$function$;

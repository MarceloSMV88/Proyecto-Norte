-- Sincroniza accounts.balance con las transacciones, para CUALQUIER origen
-- (modal manual, wallet-ingest, notif-ingest, transfer-ingest, SQL directo).
-- Los amounts ya llevan signo: gasto (-) baja el saldo / sube deuda de TC,
-- ingreso (+) sube el saldo, patas de transfer llevan ±.
-- IMPORTANTE: desde esta migración las Edge Functions ya NO actualizan saldos a mano.
create or replace function public.sync_account_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE' or tg_op = 'UPDATE') and old.account_id is not null then
    update accounts set balance = balance - old.amount where id = old.account_id;
  end if;
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') and new.account_id is not null then
    update accounts set balance = balance + new.amount where id = new.account_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_sync_account_balance
after insert or update or delete on public.transactions
for each row execute function public.sync_account_balance();

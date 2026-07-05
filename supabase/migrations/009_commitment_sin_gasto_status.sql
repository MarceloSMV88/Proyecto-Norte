-- Nuevo estado "sin_gasto": el usuario confirma a mano que este compromiso costó $0 este
-- mes (ej. una TC que no se ocupó), a diferencia de "omitido" (no aplica en absoluto) y
-- de "pendiente" (todavía sin revisar). Se filtra fuera de "Pendientes" en la UI.
alter table public.monthly_commitments drop constraint monthly_commitments_status_check;
alter table public.monthly_commitments add constraint monthly_commitments_status_check
  check (status in ('pendiente','detectado','pagado','vencido','omitido','sin_gasto'));

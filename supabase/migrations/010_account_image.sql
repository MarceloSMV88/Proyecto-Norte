-- Permite reemplazar el ícono genérico de una cuenta por una imagen propia (logo del banco, etc.)
alter table public.accounts add column if not exists image_url text;

-- Bucket público para las imágenes de cuentas (se sirven directo por URL, sin firmar).
insert into storage.buckets (id, name, public)
values ('account-images', 'account-images', true)
on conflict (id) do nothing;

-- Solo usuarios autenticados de la app pueden subir/editar/borrar; la lectura es pública
-- porque el bucket es public (se sirve por /storage/v1/object/public/... sin pasar por RLS).
drop policy if exists account_images_insert on storage.objects;
create policy account_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'account-images');

drop policy if exists account_images_update on storage.objects;
create policy account_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'account-images');

drop policy if exists account_images_delete on storage.objects;
create policy account_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'account-images');

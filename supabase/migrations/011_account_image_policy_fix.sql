-- Las políticas de storage.objects para 'account-images' quedaron restringidas al rol
-- "authenticated", pero el resto de las políticas del proyecto (accounts, categories, etc.)
-- usan "public" y confían en la condición interna (auth.uid()), no en el rol de conexión.
-- Storage rechazaba la subida (400 / RLS violation) porque el rol real de la conexión no
-- calzaba exactamente con "authenticated". Se alinean estas políticas al mismo patrón que
-- ya usa el resto de la app: rol "public" + exigir un usuario real vía auth.uid() (no abierto
-- a anónimos verdaderos, que igual tendrían auth.uid() null).
drop policy if exists account_images_insert on storage.objects;
create policy account_images_insert on storage.objects
  for insert to public
  with check (bucket_id = 'account-images' and auth.uid() is not null);

drop policy if exists account_images_update on storage.objects;
create policy account_images_update on storage.objects
  for update to public
  using (bucket_id = 'account-images' and auth.uid() is not null);

drop policy if exists account_images_delete on storage.objects;
create policy account_images_delete on storage.objects
  for delete to public
  using (bucket_id = 'account-images' and auth.uid() is not null);

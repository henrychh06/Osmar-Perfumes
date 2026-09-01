-- Ejecuta esto una sola vez en el SQL Editor de tu proyecto Supabase
-- (dashboard -> SQL Editor -> New query -> pega todo -> Run).

-- 1) Tabla de una sola fila que guarda todo el estado del admin
--    (mismo formato que hoy vive en localStorage['maros:admin:v4']).
create table if not exists public.site_data (
  id smallint primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_data_singleton check (id = 1)
);

insert into public.site_data (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.site_data enable row level security;

drop policy if exists "public can read site data" on public.site_data;
create policy "public can read site data"
  on public.site_data for select
  to anon, authenticated
  using (true);

drop policy if exists "authenticated can insert site data" on public.site_data;
create policy "authenticated can insert site data"
  on public.site_data for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated can update site data" on public.site_data;
create policy "authenticated can update site data"
  on public.site_data for update
  to authenticated
  using (true)
  with check (true);

-- 2) Bucket de Storage para las fotos de productos/packs.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public can read product images" on storage.objects;
create policy "public can read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "authenticated can upload product images" on storage.objects;
create policy "authenticated can upload product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

drop policy if exists "authenticated can update product images" on storage.objects;
create policy "authenticated can update product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images');

drop policy if exists "authenticated can delete product images" on storage.objects;
create policy "authenticated can delete product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');

-- 3) Crea el usuario real del cliente en Authentication -> Users -> Add user
--    (email + contraseña) desde el dashboard. No hace falta SQL para esto.

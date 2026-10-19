-- =========================================================
-- CaseBeer — база в Supabase
-- Вставить целиком в Supabase → SQL Editor → New query → Run.
-- Скрипт можно запускать повторно: он ничего не удаляет из данных игроков.
-- =========================================================

-- ---------- профили игроков ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nick        text not null unique check (char_length(nick) between 3 and 20),
  avatar_url  text,
  state       jsonb not null default '{}'::jsonb,   -- баланс, инвентарь, статистика
  net_worth   bigint not null default 0,            -- баланс + стоимость инвентаря, ₽
  updated_at  timestamptz not null default now()
);
alter table public.profiles add column if not exists balance bigint not null default 0; -- деньги на счету, ₽
alter table public.profiles add column if not exists peak bigint not null default 0;    -- пик денег за всё время, ₽

-- пик денег считает база: он только растёт, клиент не может его уменьшить или задать сам
create or replace function public.profiles_keep_peak() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.peak := greatest(new.balance, 0);
  else
    new.peak := greatest(old.peak, new.balance);
  end if;
  return new;
end $$;
drop trigger if exists profiles_keep_peak on public.profiles;
create trigger profiles_keep_peak before insert or update on public.profiles
  for each row execute function public.profiles_keep_peak();

alter table public.profiles enable row level security;

-- каждый видит и меняет только свою строку
drop policy if exists "own profile: select" on public.profiles;
create policy "own profile: select" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "own profile: insert" on public.profiles;
create policy "own profile: insert" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "own profile: update" on public.profiles;
create policy "own profile: update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- закреплённые лидеры (не аккаунты) ----------
create table if not exists public.pinned_leaders (
  nick        text primary key,
  avatar_url  text,
  net_worth   bigint not null      -- для закреплённых это и есть их пик денег
);
alter table public.pinned_leaders enable row level security;
insert into public.pinned_leaders (nick, avatar_url, net_worth) values
  ('kryon',       'img/ava-kryon.jpg',       10912131),
  ('spiderkaras', 'img/ava-spiderkaras.jpg',  6537211)
on conflict (nick) do update set avatar_url = excluded.avatar_url, net_worth = excluded.net_worth;

-- ---------- топ по пику денег: пересчитывается раз в 5 минут ----------
drop materialized view if exists public.leaderboard;
create materialized view public.leaderboard as
  select nick, avatar_url, peak, balance, false as pinned from public.profiles
  union all
  select nick, avatar_url, net_worth as peak, net_worth as balance, true as pinned from public.pinned_leaders
  order by peak desc
  limit 50;
grant select on public.leaderboard to anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'casebeer-refresh-top';
select cron.schedule('casebeer-refresh-top', '*/5 * * * *', 'refresh materialized view public.leaderboard');

-- ---------- реальные дропы для ленты ----------
create table if not exists public.drops (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nick        text not null,
  skin_id     text not null,
  case_id     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists drops_created_at on public.drops (created_at desc);
alter table public.drops enable row level security;

drop policy if exists "drops: read all" on public.drops;
create policy "drops: read all" on public.drops for select to anon, authenticated using (true);
drop policy if exists "drops: insert own" on public.drops;
create policy "drops: insert own" on public.drops for insert to authenticated with check (user_id = auth.uid());

-- не храним дропы дольше суток
select cron.unschedule(jobid) from cron.job where jobname = 'casebeer-clean-drops';
select cron.schedule('casebeer-clean-drops', '17 * * * *', $$delete from public.drops where created_at < now() - interval '1 day'$$);

-- ---------- аватарки ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;

-- игрок может загружать и менять только файлы в своей папке avatars/<uid>/...
drop policy if exists "avatars: insert own" on storage.objects;
create policy "avatars: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: update own" on storage.objects;
create policy "avatars: update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: delete own" on storage.objects;
create policy "avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- проверить ник до регистрации (занят или нет), не раскрывая остальные данные
create or replace function public.nick_taken(p_nick text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where lower(nick) = lower(p_nick))
      or exists (select 1 from public.pinned_leaders where lower(nick) = lower(p_nick));
$$;
grant execute on function public.nick_taken(text) to anon, authenticated;

-- первый расчёт топа
refresh materialized view public.leaderboard;

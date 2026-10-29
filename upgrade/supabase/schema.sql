-- Выполните целиком в Supabase → SQL Editor → New query → Run (повторный запуск безопасен).
-- Все изменения баланса и инвентаря идут только через функции ниже (security definer),
-- поэтому накрутить баланс или подменить результат апгрейда с клиента нельзя.

-- ───────── Цены скинов (заполняет Edge Function sync-prices) ─────────
-- Названия и картинки лежат в catalog.json, в базе нужны только цены — по ним сервер считает шанс.
create table if not exists public.items (
  id text primary key,                -- market_hash_name, напр. "AK-47 | Redline (Field-Tested)"
  price numeric(12,2) not null check (price > 0),
  updated_at timestamptz not null default now()
);
-- для баз, созданных первой версией схемы
alter table public.items
  drop column if exists weapon, drop column if exists skin, drop column if exists wear,
  drop column if exists rarity_color, drop column if exists image,
  drop column if exists stattrak, drop column if exists souvenir;
drop index if exists items_price_idx;
create index if not exists items_updated_idx on public.items (updated_at desc);

-- ───────── Игроки ─────────
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (char_length(username) between 3 and 20),
  balance numeric(14,2) not null default 1.00 check (balance >= 0),
  clicks bigint not null default 0,
  upgrades_total int not null default 0,
  upgrades_won int not null default 0,
  best_win numeric(12,2) not null default 0,
  last_click_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  item_id text not null references public.items on update cascade,
  created_at timestamptz not null default now()
);
create index if not exists inventory_user_idx on public.inventory (user_id);

-- Лента апгрейдов (для полосы слева)
create table if not exists public.upgrade_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles on delete set null,
  username text not null,
  item_id text not null,
  won boolean not null,
  chance numeric(6,4) not null,
  created_at timestamptz not null default now()
);

-- ───────── RLS: читать можно, писать — только через функции ─────────
alter table public.items enable row level security;
alter table public.profiles enable row level security;
alter table public.inventory enable row level security;
alter table public.upgrade_log enable row level security;

drop policy if exists "items readable" on public.items;
create policy "items readable" on public.items for select using (true);
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own inventory" on public.inventory;
create policy "own inventory" on public.inventory for select using (auth.uid() = user_id);
drop policy if exists "log readable" on public.upgrade_log;
create policy "log readable" on public.upgrade_log for select using (true);

-- ───────── Профиль создаётся автоматически при регистрации ─────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '[^A-Za-z0-9_А-Яа-яЁё.-]', '', 'g'), 20);
begin
  if char_length(v_name) < 3 then v_name := 'player'; end if;
  if exists (select 1 from profiles where lower(username) = lower(v_name)) then
    v_name := left(v_name, 15) || '_' || substr(md5(random()::text), 1, 4);
  end if;
  insert into profiles (id, username) values (new.id, v_name);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── Кликер: не больше 20 кликов в секунду, $0.01 за клик ─────────
create or replace function public.register_clicks(p_count int)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_allowed int;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select last_click_at into v_last from profiles where id = v_uid for update;
  v_allowed := least(greatest(p_count, 0), 60, floor(extract(epoch from now() - v_last) * 20)::int);
  update profiles
     set balance = balance + v_allowed * 0.01,
         clicks = clicks + v_allowed,
         last_click_at = now()
   where id = v_uid
  returning balance into v_balance;
  return v_balance;
end $$;

-- ───────── Апгрейд: шанс = вход / цена цели × 0.95, от 1% до 75% ─────────
create or replace function public.do_upgrade(p_inv_ids bigint[], p_balance numeric, p_target text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ids bigint[] := coalesce(p_inv_ids, '{}');
  v_bal numeric := round(coalesce(p_balance, 0), 2);
  v_have numeric;
  v_cnt int;
  v_items_sum numeric;
  v_target items%rowtype;
  v_chance numeric;
  v_roll double precision;
  v_won boolean;
  v_new_id bigint;
  v_name text;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if v_bal < 0 then raise exception 'Invalid amount'; end if;

  select balance, username into v_have, v_name from profiles where id = v_uid for update;
  if v_have < v_bal then raise exception 'Not enough balance'; end if;

  select count(*), coalesce(sum(i.price), 0) into v_cnt, v_items_sum
    from inventory inv join items i on i.id = inv.item_id
   where inv.id = any(v_ids) and inv.user_id = v_uid;
  if v_cnt <> coalesce(array_length(v_ids, 1), 0) then raise exception 'Item not found'; end if;

  select * into v_target from items where id = p_target;
  if not found then raise exception 'Target not found'; end if;
  if v_items_sum + v_bal <= 0 then raise exception 'Select items or balance'; end if;

  v_chance := (v_items_sum + v_bal) / v_target.price * 0.95;
  if v_chance > 0.75 then raise exception 'Chance is above 75%% — pick a more expensive item'; end if;
  if v_chance < 0.01 then raise exception 'Chance is below 1%%'; end if;

  v_roll := random();
  v_won := v_roll < v_chance;

  delete from inventory where id = any(v_ids) and user_id = v_uid;
  update profiles
     set balance = balance - v_bal,
         upgrades_total = upgrades_total + 1,
         upgrades_won = upgrades_won + v_won::int,
         best_win = case when v_won then greatest(best_win, v_target.price) else best_win end
   where id = v_uid
  returning balance into v_have;

  if v_won then
    insert into inventory (user_id, item_id) values (v_uid, p_target) returning id into v_new_id;
  end if;
  insert into upgrade_log (user_id, username, item_id, won, chance) values (v_uid, v_name, p_target, v_won, v_chance);

  return json_build_object('won', v_won, 'roll', v_roll, 'chance', v_chance, 'inv_id', v_new_id, 'balance', v_have);
end $$;

-- ───────── Продажа предмета по текущей цене ─────────
create or replace function public.sell_items(p_inv_ids bigint[])
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sum numeric;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  perform 1 from profiles where id = v_uid for update;
  with sold as (
    delete from inventory inv using items i
     where inv.id = any(p_inv_ids) and inv.user_id = v_uid and i.id = inv.item_id
    returning i.price
  )
  select coalesce(sum(price), 0) into v_sum from sold;
  update profiles set balance = balance + v_sum where id = v_uid returning balance into v_balance;
  return v_balance;
end $$;

-- ───────── Магазин: покупка скинов за баланс по текущей цене ─────────
create or replace function public.buy_items(p_items text[])
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_n int := coalesce(array_length(p_items, 1), 0);
  v_cnt int;
  v_sum numeric;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if v_n = 0 or v_n > 50 then raise exception 'Select 1–50 skins'; end if;
  select count(*), coalesce(sum(i.price), 0) into v_cnt, v_sum
    from unnest(p_items) as t(id) join items i on i.id = t.id;
  if v_cnt <> v_n then raise exception 'Skin not found'; end if;
  select balance into v_balance from profiles where id = v_uid for update;
  if v_balance < v_sum then raise exception 'Not enough balance'; end if;
  update profiles set balance = balance - v_sum where id = v_uid returning balance into v_balance;
  insert into inventory (user_id, item_id) select v_uid, t.id from unnest(p_items) as t(id);
  return v_balance;
end $$;

-- ───────── Лидерборд и статистика (видны всем) ─────────
create or replace function public.get_leaderboard(p_limit int default 50)
returns table (username text, networth numeric, balance numeric, inventory_value numeric,
               upgrades_won int, upgrades_total int, best_win numeric, clicks bigint)
language sql security definer set search_path = public stable as $$
  select p.username,
         p.balance + coalesce(sum(i.price), 0) as networth,
         p.balance,
         coalesce(sum(i.price), 0) as inventory_value,
         p.upgrades_won, p.upgrades_total, p.best_win, p.clicks
    from profiles p
    left join inventory inv on inv.user_id = p.id
    left join items i on i.id = inv.item_id
   group by p.id
   order by networth desc
   limit least(p_limit, 100);
$$;

-- Удаление устаревших цен (вызывает только Edge Function с секретным ключом).
-- Скины, которые лежат у игроков в инвентаре, не трогаем.
create or replace function public.prune_items(p_before timestamptz)
returns int language sql security definer set search_path = public as $$
  with gone as (
    delete from items i
     where i.updated_at < p_before
       and not exists (select 1 from inventory inv where inv.item_id = i.id)
    returning 1
  )
  select count(*)::int from gone;
$$;
revoke execute on function public.prune_items(timestamptz) from public, anon, authenticated;
do $$ begin
  grant execute on function public.prune_items(timestamptz) to service_role;
exception when undefined_object then null; end $$;

-- Все цены одним запросом: { updated_at, prices: { market_hash_name: price } }
create or replace function public.get_prices()
returns json language sql security definer set search_path = public stable as $$
  select json_build_object(
    'updated_at', max(updated_at),
    'prices', coalesce(json_object_agg(id, price), '{}'::json)
  ) from items;
$$;

create or replace function public.get_stats()
returns json language sql security definer set search_path = public stable as $$
  select json_build_object(
    'players', (select count(*) from profiles),
    'upgrades', (select count(*) from upgrade_log)
  );
$$;

revoke execute on function public.register_clicks(int) from public, anon;
revoke execute on function public.do_upgrade(bigint[], numeric, text) from public, anon;
revoke execute on function public.sell_items(bigint[]) from public, anon;
revoke execute on function public.buy_items(text[]) from public, anon;
grant execute on function public.register_clicks(int) to authenticated;
grant execute on function public.do_upgrade(bigint[], numeric, text) to authenticated;
grant execute on function public.sell_items(bigint[]) to authenticated;
grant execute on function public.buy_items(text[]) to authenticated;

-- Realtime для ленты апгрейдов
do $$ begin
  alter publication supabase_realtime add table public.upgrade_log;
exception when duplicate_object then null; end $$;

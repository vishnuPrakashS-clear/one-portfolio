-- Helpers for the refresh-prices Edge Function. They run with the caller's rights (security invoker) and are
-- granted to service_role only, so a signed-in person or the public key can't call them.

-- what to price for one portfolio row: held US/London symbols, the Indian watch list, last prices, the last refresh
-- time, and the newest month already stored in the monthly price history (pxm_last) so history is fetched once a month
create or replace function public.price_refresh_input_row(pid text) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'row_id', p.id,
    'today', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
    'weekday_india', trim(to_char(now() at time zone 'Asia/Kolkata', 'Day')),
    'refreshed_at', p.data#>>'{settings,refreshedAt}',
    'holdings', coalesce((select jsonb_agg(jsonb_build_object('sym', h->>'sym', 'price', h->'price', 'priceAt', h->'priceAt'))
                 from jsonb_array_elements(coalesce(p.data->'holdings','[]'::jsonb)) h
                 where coalesce((select sum((l->>'q')::numeric) from jsonb_array_elements(coalesce(h->'lots','[]'::jsonb)) l), 0) > 0), '[]'::jsonb),
    'fx', p.data#>'{settings,fx}',
    'india_watch', coalesce(p.data#>'{india,watch}', '[]'::jsonb),
    'india_px', coalesce(p.data#>'{india,px}', '{}'::jsonb),
    'pxm_last', coalesce((select jsonb_object_agg(e.k, (select max(m) from jsonb_object_keys(e.v) m))
                 from jsonb_each(coalesce(p.data->'pxm', '{}'::jsonb)) e(k, v) where jsonb_typeof(e.v) = 'object'), '{}'::jsonb))
  from public.portfolio p where p.id = pid;
$$;

-- write a refresh into one row: only price fields, the ₹/$ rate (and its history), the copper value check, Indian
-- prices, watch-list codes, month-end price history, the refresh time and one log line
create or replace function public.apply_price_refresh(p jsonb) returns text
language plpgsql security invoker set search_path = public as $$
declare
  d jsonb; hs jsonb := '[]'::jsonb; h jsonb; np jsonb; lots jsonb; l jsonb; nl jsonb;
  fh jsonb; today text; prev_newest text; best text; n_us int := 0; n_in int := 0; n_hist int := 0; i int; j int;
  w jsonb; nw jsonb := '[]'::jsonb; wu jsonb; lg jsonb; rid text := coalesce(p->>'row_id', 'main');
  pm jsonb; hk text; hv jsonb;
begin
  select data into d from public.portfolio where id = rid for update;
  if d is null then return 'no portfolio row'; end if;
  today := coalesce(p->>'today', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'));
  fh := coalesce(d#>'{settings,fxHistory}', '{}'::jsonb);
  select max(k) into prev_newest from jsonb_object_keys(fh) k where k < today;
  if jsonb_typeof(p->'fx') = 'number' and (p->>'fx')::numeric between 80 and 120 then
    d := jsonb_set(d, '{settings,fx}', p->'fx');
    d := jsonb_set(d, '{settings,fxAt}', to_jsonb(today));
    fh := fh || jsonb_build_object(today, p->'fx');
    d := jsonb_set(d, '{settings,fxHistory}', fh);
  end if;
  for i in 0 .. coalesce(jsonb_array_length(d->'holdings'), 0) - 1 loop
    h := d->'holdings'->i;
    np := p->'prices'->(h->>'sym');
    if np is not null and jsonb_typeof(np->'price') = 'number' and (np->>'priceAt') is not null then
      h := h || jsonb_build_object('price', np->'price', 'priceAt', np->'priceAt'); n_us := n_us + 1;
    end if;
    lots := coalesce(h->'lots', '[]'::jsonb); nl := '[]'::jsonb;
    for j in 0 .. jsonb_array_length(lots) - 1 loop
      l := lots->j;
      if not (l ? 'fx') and (l->>'d') is not null and (prev_newest is null or (l->>'d') >= prev_newest) then
        select max(k) into best from jsonb_object_keys(fh) k where k <= (l->>'d');
        if best is not null then l := l || jsonb_build_object('fx', fh->best); end if;
      end if;
      nl := nl || jsonb_build_array(l);
    end loop;
    if h ? 'lots' then h := jsonb_set(h, '{lots}', nl); end if;
    hs := hs || jsonb_build_array(h);
  end loop;
  if d ? 'holdings' then d := jsonb_set(d, '{holdings}', hs); end if;
  if jsonb_typeof(p->'copx') = 'object' then
    d := jsonb_set(d, '{settings,signals}', coalesce(d#>'{settings,signals}', '{}'::jsonb) || jsonb_build_object('LSE~COPX', p->'copx'));
  end if;
  if jsonb_typeof(p->'india_px') = 'object' and d ? 'india' then
    d := jsonb_set(d, '{india,px}', coalesce(d#>'{india,px}', '{}'::jsonb) || (p->'india_px'));
    select count(*) into n_in from jsonb_object_keys(p->'india_px');
    d := jsonb_set(d, '{india,pricedAt}', to_jsonb(today));
  end if;
  if jsonb_typeof(p->'india_watch') = 'object' and jsonb_typeof(d#>'{india,watch}') = 'array' then
    for w in select * from jsonb_array_elements(d#>'{india,watch}') loop
      wu := p->'india_watch'->(w->>'key');
      if wu is not null then w := w || jsonb_strip_nulls(jsonb_build_object('nse', wu->'nse', 'mfcode', wu->'mfcode', 'isin', wu->'isin')); end if;
      nw := nw || jsonb_build_array(w);
    end loop;
    d := jsonb_set(d, '{india,watch}', nw);
  end if;
  -- month-end prices: {key: {"YYYY-MM": price}}, merged month by month
  if jsonb_typeof(p->'pxm') = 'object' then
    pm := coalesce(d->'pxm', '{}'::jsonb);
    for hk, hv in select * from jsonb_each(p->'pxm') loop
      if jsonb_typeof(hv) = 'object' then pm := pm || jsonb_build_object(hk, coalesce(pm->hk, '{}'::jsonb) || hv); n_hist := n_hist + 1; end if;
    end loop;
    d := d || jsonb_build_object('pxm', pm);
  end if;
  d := jsonb_set(d, '{settings,refreshedAt}', to_jsonb(coalesce(p->>'refreshedAt', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"'))));
  d := jsonb_set(d, '{updatedAt}', to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  if (p->>'log') is not null then
    lg := coalesce(d->'log', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('d', today, 'text', p->>'log'));
    select coalesce(jsonb_agg(x order by o), '[]'::jsonb) into lg from (select x, o from jsonb_array_elements(lg) with ordinality t(x, o) order by o desc limit 60) s;
    d := jsonb_set(d, '{log}', lg);
  end if;
  update public.portfolio set data = d where id = rid;
  return format('US/London prices: %s, India prices: %s, monthly history: %s', n_us, n_in, n_hist);
end $$;

revoke all on function public.price_refresh_input_row(text) from public, anon, authenticated;
revoke all on function public.apply_price_refresh(jsonb) from public, anon, authenticated;
grant execute on function public.price_refresh_input_row(text) to service_role;
grant execute on function public.apply_price_refresh(jsonb) to service_role;

-- month-end price history for one row: merges {key: {"YYYY-MM": price}} into data.pxm and touches nothing else
create or replace function public.apply_price_history(rid text, pxm jsonb) returns text
language plpgsql security invoker set search_path = public as $$
declare d jsonb; pm jsonb; hk text; hv jsonb; n int := 0;
begin
  select data into d from public.portfolio where id = rid for update;
  if d is null then return 'no portfolio row'; end if;
  pm := coalesce(d->'pxm', '{}'::jsonb);
  for hk, hv in select * from jsonb_each(pxm) loop
    if jsonb_typeof(hv) = 'object' then pm := pm || jsonb_build_object(hk, coalesce(pm->hk, '{}'::jsonb) || hv); n := n + 1; end if;
  end loop;
  update public.portfolio set data = d || jsonb_build_object('pxm', pm) where id = rid;
  return format('history for %s holdings', n);
end $$;
revoke all on function public.apply_price_history(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_price_history(text, jsonb) to service_role;

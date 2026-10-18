-- Helpers for the refresh-prices Edge Function. Both run with the caller's rights (security invoker),
-- so the public (anon) role sees and changes nothing; the Edge Function calls them with the service role.

-- what to price: held US/London symbols, the Indian watch list, last prices and the last refresh time
create or replace function public.price_refresh_input() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'today', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'),
    'weekday_india', trim(to_char(now() at time zone 'Asia/Kolkata', 'Day')),
    'refreshed_at', p.data#>>'{settings,refreshedAt}',
    'holdings', coalesce((select jsonb_agg(jsonb_build_object('sym', h->>'sym', 'price', h->'price', 'priceAt', h->'priceAt'))
                 from jsonb_array_elements(p.data->'holdings') h
                 where coalesce((select sum((l->>'q')::numeric) from jsonb_array_elements(coalesce(h->'lots','[]'::jsonb)) l), 0) > 0), '[]'::jsonb),
    'fx', p.data#>'{settings,fx}',
    'india_watch', coalesce(p.data#>'{india,watch}', '[]'::jsonb),
    'india_px', coalesce(p.data#>'{india,px}', '{}'::jsonb))
  from public.portfolio p where p.id = 'main';
$$;

-- write a refresh: only price fields, the ₹/$ rate (and its history), the copper value check, Indian prices,
-- watch-list codes, the refresh time and one log line; everything else in the document is left as it is
create or replace function public.apply_price_refresh(p jsonb) returns text
language plpgsql security invoker set search_path = public as $$
declare
  d jsonb; hs jsonb := '[]'::jsonb; h jsonb; np jsonb; lots jsonb; l jsonb; nl jsonb;
  fh jsonb; today text; prev_newest text; best text; n_us int := 0; n_in int := 0; i int; j int;
  w jsonb; nw jsonb := '[]'::jsonb; wu jsonb; lg jsonb;
begin
  select data into d from public.portfolio where id = 'main' for update;
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
  d := jsonb_set(d, '{settings,refreshedAt}', to_jsonb(coalesce(p->>'refreshedAt', to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"'))));
  d := jsonb_set(d, '{updatedAt}', to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  if (p->>'log') is not null then
    lg := coalesce(d->'log', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('d', today, 'text', p->>'log'));
    select coalesce(jsonb_agg(x order by o), '[]'::jsonb) into lg from (select x, o from jsonb_array_elements(lg) with ordinality t(x, o) order by o desc limit 60) s;
    d := jsonb_set(d, '{log}', lg);
  end if;
  update public.portfolio set data = d where id = 'main';
  return format('US/London prices: %s, India prices: %s', n_us, n_in);
end $$;

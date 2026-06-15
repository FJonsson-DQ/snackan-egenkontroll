# Nattlig nollställning av lagret

Mål: lagret nollställs automatiskt varje natt, **utom natten mellan lördag och söndag**
(söndag morgon behåller alltså lördagens värden). Innan nollställning sparas en
sammanfattning i "Tidigare inventeringar", precis som knappen "Sammanfatta & nollställ".

## Hur det fungerar

Appen ligger som en statisk sida (GitHub Pages) och har ingen egen server. Den nattliga
körningen sker därför i databasen via **pg_cron** i Supabase. Det betyder att den körs
även när ingen har appen öppen, och är gemensam för alla.

Tid: **02:00 UTC** (≈ 03:00 vintertid / 04:00 sommartid svensk tid) natten till
måndag, tisdag, onsdag, torsdag, fredag och lördag. Natten lördag→söndag (söndag 02:00 UTC)
hoppas över.

Om allt redan är 0 gör jobbet ingenting: ingen tom sammanfattning sparas och inga rader
uppdateras.

**En inventering per dag.** Jobbet representerar dagen som just tagit slut (det körs efter
midnatt), så det riktar in sig på **gårdagens** datum (svensk tid). Finns redan en
inventering för den dagen (t.ex. en manuell "Sammanfatta") uppdateras den istället för att
en ny skapas. Den manuella knappen i appen följer samma regel fast för dagens datum.

## SQL att köra i Supabase (SQL Editor)

Kör hela blocket en gång. Det är idempotent (säkert att köra om).

```sql
-- 1. Funktion: spara/uppdatera gårdagens sammanfattning av varor > 0, nollställ dem sedan.
create or replace function public.nattlig_lager_nollstallning()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data        jsonb;
  v_target_date date;
  v_existing_id inventory_snapshots.id%type;
begin
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'namn',          i.namn,
               'huvud',         i.huvud,
               'underkategori', coalesce(s.namn, 'Övrigt'),
               'artikelnummer', coalesce(i.artikelnummer, ''),
               'enhet',         i.enhet,
               'antal',         i.antal
             )
             order by i.namn
           ),
           '[]'::jsonb
         )
  into v_data
  from inventory i
  left join subcategories s on s.id = i.underkategori_id
  where i.antal > 0;

  -- Allt redan nollat -> gör ingenting.
  if v_data = '[]'::jsonb then
    return;
  end if;

  -- Dagen som just avslutats (svensk tid). Körs 02:00 UTC = tidig morgon -> gårdagen.
  v_target_date := ((now() at time zone 'Europe/Stockholm')::date) - 1;

  -- Finns redan en inventering för den dagen? Uppdatera den i så fall.
  select id into v_existing_id
  from inventory_snapshots
  where (skapad_at at time zone 'Europe/Stockholm')::date = v_target_date
  order by skapad_at desc
  limit 1;

  if v_existing_id is not null then
    update inventory_snapshots
    set data      = v_data,
        skapad_av = 'System (nattlig)'
    where id = v_existing_id;
  else
    insert into inventory_snapshots (skapad_av, data, skapad_at)
    values (
      'System (nattlig)',
      v_data,
      ((v_target_date::timestamp + time '12:00') at time zone 'Europe/Stockholm')
    );
  end if;

  update inventory
  set antal      = 0,
      updated_by = 'System (nattlig)',
      updated_at = now()
  where antal > 0;
end;
$$;

-- 2. Aktivera pg_cron (om det inte redan är på).
create extension if not exists pg_cron;

-- 3. Schemalägg: 02:00 UTC måndag-lördag (dvs hoppa över natten lör->sön).
--    Om jobbet redan finns, ta bort det först (rad nedan), kör sedan om.
-- select cron.unschedule('nattlig-lager-nollstallning');
select cron.schedule(
  'nattlig-lager-nollstallning',
  '0 2 * * 1-6',
  $$ select public.nattlig_lager_nollstallning(); $$
);
```

### Cron-uttrycket `0 2 * * 1-6`

`minut timme dag månad veckodag`. Veckodag 1-6 = måndag-lördag (0 = söndag, exkluderas).
Körningen 02:00 UTC en viss dag motsvarar nollställning den dagens morgon:

| Körning (UTC)   | Natt som nollställs | Med? |
|-----------------|---------------------|------|
| Mån 02:00       | sön → mån           | Ja   |
| Tis 02:00       | mån → tis           | Ja   |
| Ons 02:00       | tis → ons           | Ja   |
| Tors 02:00      | ons → tors          | Ja   |
| Fre 02:00       | tors → fre          | Ja   |
| Lör 02:00       | fre → lör           | Ja   |
| Sön 02:00       | **lör → sön**       | Nej  |

## Testa manuellt

```sql
select public.nattlig_lager_nollstallning();
```

Kör den och kolla att en ny inventering dök upp i appen under "Tidigare inventeringar"
och att alla antal blev 0.

## Kontroll och borttagning

```sql
-- Se schemalagda jobb:
select jobid, schedule, jobname, active from cron.job;

-- Se senaste körningar:
select * from cron.job_run_details order by start_time desc limit 20;

-- Ta bort schemat helt:
select cron.unschedule('nattlig-lager-nollstallning');
```

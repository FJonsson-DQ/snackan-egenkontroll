# Bow's App – Designspec: Lagersida (inventory)

Datum: 2026-06-13

## Syfte

En ny flik "Lager" för löpande lagersaldo i köket. Varje vara har en aktuell
mängd som justeras med +/- (eller exakt värde). Grunden för en kommande
inköpslista, men kopplingen dit byggs INTE nu.

## Plattform / kontext

Bygger på befintliga appen (statisk HTML/CSS/JS, Supabase-backend med cache och
realtid, Google-inloggning + tillåtlista). Delas av alla fyra användare i realtid.

## Datamodell (ny Supabase-tabell `inventory`)

- `id` (uuid)
- `namn` (text)
- `kategori` (text: 'varmt' | 'kyl' | 'frys')
- `enhet` (text: 'kg' | 'liter' | 'antal')
- `antal` (numeric, >= 0)
- `updated_at` (timestamptz)
- `updated_by` (text – e-post, vem som ändrade senast)

RLS: samma som units/readings – endast tillåtna användare (funktionen
`is_allowed()`) får läsa/skriva. Tabellen läggs i realtidspubliceringen.

## Vy: Lager (ny flik i nedre menyn)

- Fyra flikar totalt: Enheter, Logga, Lager, Historik.
- Varorna grupperas under tre rubriker i ordning: **Varmt · Kyl · Frys**.
  Rubrik visas bara om kategorin har varor.
- Varje vara är en rad: namn, aktuell mängd + enhet, och **−/+** knappar.
  - Tryck på mängden för att skriva in ett exakt värde.
  - Antal kan inte gå under 0.
  - Steg: ±1 för `antal`, ±0,5 för `kg`/`liter`.
- Knapp överst: **"+ Lägg till vara"**.
- Tom-läge: hjälptext när inga varor finns.

## Lägg till / redigera vara (modal, samma stil som enhets-modalen)

- Fält: namn, kategori (segmenterad varmt/kyl/frys), enhet (segmenterad
  kg/liter/antal), startantal.
- Går att redigera och ta bort en vara.
- En vara tillhör exakt en kategori och en enhet.

## Lagringslager

Utökar `Store` med inventory-cache och funktioner (`getInventory`, `saveItem`,
`deleteItem`, `setAmount`) som speglar molnet, på samma sätt som units/readings.
Realtid: prenumerera även på `inventory`-tabellen och rita om Lager-vyn vid
ändring.

## Avgränsningar (inte nu)

- Koppling till inköpslista / "lågt i lager"-markering (kommer senare).
- Historik över lagerförändringar.
- Flera kategorier per vara (en vara = en kategori).

## Steg-för-steg som användaren kör i Supabase

En SQL-snutt som skapar tabellen, RLS-policy och lägger till den i realtid
(tillhandahålls vid implementation).

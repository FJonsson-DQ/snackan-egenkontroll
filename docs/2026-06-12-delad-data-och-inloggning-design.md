# Bow's App – Designspec v2: Delad data + inloggning

Datum: 2026-06-12
Bygger vidare på: `2026-06-12-temperaturloggning-design.md` (v1)

## Bakgrund och förändring

Appen ska användas av **tre personer som delar samma data** – när en loggar en
temperatur ska de andra se den. Dessutom planeras en känsligare integration mot
Martin Servera, som motiverar **inloggning**.

Det gör att v1:s lokala lagring (localStorage) inte räcker. Vi flyttar datan till
en gemensam molntjänst och lägger till inloggning, men behåller appen som samma
enkla webbsida på samma GitHub Pages-länk.

## Teknikval

- **Frontend:** oförändrad – vanlig HTML/CSS/JS utan byggsteg, på GitHub Pages.
  Supabase-klienten laddas via CDN (`<script>`).
- **Backend (molnet):** Supabase (gratisnivå räcker för tre användare).
  - **Auth:** Google-inloggning.
  - **Databas:** Postgres med tabeller för enheter och loggar.
  - **Realtid:** Supabase Realtime så allas vyer uppdateras direkt.
- **Behörighet:** Row Level Security (RLS) + en tillåtlista. Endast e-postadresser
  i tillåtlistan får läsa/skriva. Spärren ligger i databasen, inte i gränssnittet,
  så den går inte att kringgå.

Supabase `anon`-nyckeln ligger i frontend-koden. Det är avsiktligt och säkert –
nyckeln är publik och skyddet sker via RLS. Hemligheter för Martin Servera får
INTE ligga i frontend (se fas 3).

## Datamodell (Postgres-tabeller)

### allowed_users
- `email` (text, primärnyckel) – tillåtna inloggningar
- `roll` (text) – t.ex. 'admin' eller 'anvandare' (för framtida bruk)

### units (enheter)
- `id` (uuid)
- `namn` (text)
- `typ` (text: 'kyl' | 'frys')
- `max_temp` (numeric)
- `created_at` (timestamptz)

### readings (loggar)
- `id` (uuid)
- `unit_id` (uuid, refererar units)
- `temp` (numeric)
- `anteckning` (text, kan vara tom)
- `loggad_av` (text – användarens e-post/namn)
- `tidpunkt` (timestamptz)

All data delas av de tre användarna (en gemensam köks-vy). RLS-policy: en rad är
läsbar/skrivbar om den inloggades e-post finns i `allowed_users`.

## Faser

### Fas 1 – Inloggning (byggs först)
- Lägg till Google-inloggning via Supabase.
- Tillåtlista (`allowed_users`) med de tre adresserna.
- Appen gömd bakom inloggning: ej inloggad → inloggningsskärm; inloggad men ej i
  listan → "du har inte åtkomst".
- Ingen annan funktionalitet ändras än att appen kräver inloggning.

### Fas 2 – Flytta datan till molnet
- Ersätt `Store` (localStorage) med Supabase-anrop bakom samma funktioner, så att
  resten av appen påverkas minimalt.
- Enheter och loggar läses/skrivs mot Supabase.
- Realtidsuppdatering: när en användare ändrar något uppdateras de andras vyer.
- Loggar märks med `loggad_av` och historiken visar vem som loggade.
- CSV-export och varningar fungerar som förut.

### Fas 3 – Martin Servera (separat spec senare)
- Känslig integration. Kräver serverdel (t.ex. Supabase Edge Function) där
  hemliga nycklar förvaras – aldrig i frontend.
- Tas som eget spec → plan → bygge när fas 1-2 är klara.

## Manuella engångssteg för användaren (jag guidar)
1. Skapa gratis Supabase-projekt.
2. Skapa en Google OAuth-inloggningsnyckel och klistra in i Supabase.
3. Lägga till de tre e-postadresserna i tillåtlistan.

## Avgränsningar (ingår inte nu)
- Offline-läge (kräver nät när datan ligger i molnet).
- Inköpslista.
- Martin Servera-integration (fas 3).
- Roller/behörighetsnivåer utöver enkel tillåtlista.

## Migrering
Nuvarande lokala data är endast testdata. Ingen migrering behövs.

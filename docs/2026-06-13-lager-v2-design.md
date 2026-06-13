# Bow's App – Designspec: Lager v2 (underkategorier, inventering, artikelnummer)

Datum: 2026-06-13
Bygger på: `2026-06-13-lager-design.md` (Lager v1)

## Syfte

Vidareutveckla Lager-fliken med (1) hierarkiska kategorier med egna
underkategorier, (2) artikelnummer per produkt, och (3) en inventeringsfunktion
som sparar en daterad ögonblicksbild och nollställer antalen för ny inräkning.

## 1. Kategorier med underkategorier

- Tre **fasta huvudkategorier**: `forrad` (Förråd), `kyl` (Kyl), `frys` (Frys).
  ("Varmt" från v1 byter namn/innebörd till Förråd.)
- **Egna underkategorier** under varje huvud. En standard-underkategori **"Övrigt"**
  finns per huvud; befintliga varor migreras dit.
- Varje **produkt** tillhör en underkategori, har en enhet (kg/liter/antal),
  ett antal, och ett valfritt **artikelnummer**.
- Lager-vyn grupperar: **Huvud → Underkategori → varor**.
- I varu-rutan: huvud (segment), underkategori (dropdown med "+ Ny underkategori"),
  namn, artikelnummer, enhet (segment), startantal.
- Omdöp/ta bort av underkategori: senare uppföljning (v2 = skapa + använda).

## 2. Inventering: "Sammanfatta & nollställ"

- Knapp på Lager-vyn. Vid tryck:
  1. Spara en **ögonblicksbild** av hela lagret (alla varor: namn, huvud,
     underkategori-namn, enhet, antal, artikelnummer) som en oföränderlig post
     med datum och vem.
  2. **Nollställ** alla varors antal till 0 (produkter och kategorier kvar).
- **Lager-historik** (inne på Lager-sidan, inte ny flik): lista över tidigare
  inventeringar (datum + vem). Tryck på en → se vad som räknades, grupperat,
  med **CSV-export**.

## Datamodell (Supabase)

### subcategories
- `id` uuid, `huvud` text ('forrad'|'kyl'|'frys'), `namn` text, `created_at`.

### inventory (utökas)
- Lägg till: `huvud` text ('forrad'|'kyl'|'frys'), `underkategori_id` uuid →
  subcategories, `artikelnummer` text (valfritt).
- Migrering: `kategori` 'varmt'→`huvud` 'forrad', annars samma; skapa "Övrigt"
  per huvud; koppla befintliga varor; ta bort gamla `kategori`-kolumnen.

### inventory_snapshots
- `id` uuid, `skapad_at` timestamptz, `skapad_av` text, `data` jsonb
  (denormaliserad lista över varorna vid tillfället).

RLS: alla tre via `is_allowed()`. subcategories och inventory_snapshots läggs i
realtidspubliceringen (inventory finns redan).

## Lagringslager (Store)

- Cache: lägg till `subcategories`. `inventory`-mappning får huvud,
  underkategori_id, artikelnummer.
- Funktioner: `getSubcategories`, `addSubcategory(huvud, namn)`, uppdaterad
  `saveItem` (huvud + underkategori_id + artikelnummer), `saveSnapshotAndReset()`,
  `getSnapshots()` (hämtas vid behov).
- Realtid: prenumerera även på subcategories (uppdatera Lager-vyn) och
  inventory_snapshots (uppdatera historiklistan om den visas).

## Vy-struktur (Lager)

- Topp: "+ Lägg till vara", "Sammanfatta & nollställ", "Tidigare inventeringar".
- Lista: per huvud (rubrik) → per underkategori (underrubrik) → varurader.
- Varurad: namn (+ litet artikelnummer om satt), −/+, mängd (tryck för exakt).
- Inventeringshistorik och snapshot-detalj visas i modaler/undervy inom Lager.

## Avgränsningar (inte nu)

- Omdöp/ta bort av underkategorier.
- Redigera en sparad ögonblicksbild (de är oföränderliga).
- Koppling till inköpslista / Martin Servera (artikelnummer förbereder detta).

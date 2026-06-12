# Bow's App – Designspec: Temperaturloggning (egenkontroll)

Datum: 2026-06-12
Version: 1 (första versionen)

## Syfte

En enkel webbapp för egenkontroll i ett verksamhetskök. Första versionen
fokuserar på att logga temperaturer för kyl- och frysenheter, se historik och
kunna exportera den vid inspektion.

Inköpslista och integration mot Martin Servera är planerat för senare steg och
ingår INTE i denna version.

## Användning och plattform

- Webbapp för mobil och surfplatta (touch), anpassar sig till skärmstorlek.
- Körs i webbläsaren, ingen server eller internetuppkoppling krävs efter att
  sidan laddats.
- Kan läggas till på hemskärmen via en `manifest.json` (PWA), så den får en
  app-ikon och fungerar offline.

## Teknikval

Vanlig HTML, CSS och JavaScript utan byggsteg eller ramverk. Data sparas lokalt
i webbläsaren med `localStorage`. Valt för enkelhet och för att vara lätt att
förstå och köra för en nybörjare.

Designen hålls medvetet enkel så att lagringen senare kan bytas mot en
molntjänst utan att bygga om hela appen (all dataåtkomst sker via en liten
samling funktioner, inte spridd över hela koden).

## Datamodell (sparas i localStorage)

### Enhet (unit)
- `id` – unikt id
- `namn` – t.ex. "Kyl 1 – grönsaker"
- `typ` – "kyl" eller "frys"
- `maxTemp` – gränsvärde i °C (loggar över detta värde flaggas)

### Loggning (reading)
- `id` – unikt id
- `unitId` – vilken enhet loggen tillhör
- `tidpunkt` – datum och tid (ISO-sträng)
- `temp` – uppmätt temperatur i °C
- `anteckning` – frivillig fritext

## Skärmar

### 1. Enheter (start)
- Lista över alla kyl/frys-enheter.
- Per enhet visas: namn, typ, senast loggad temp + datum, och grön/röd
  markering beroende på om senaste temp ligger inom gränsen.
- Knapp: "Lägg till enhet" (namn, typ, maxTemp).
- Möjlighet att redigera och ta bort en enhet.

### 2. Logga temp
- Välj enhet (eller öppnas förvald från enhetslistan).
- Fält: temp (siffra) och anteckning (frivillig).
- Vid sparande: om temp > maxTemp visas en tydlig röd varning, men loggen
  sparas ändå (avvikelsen ska dokumenteras, inte döljas).

### 3. Historik
- Loggar för en vald enhet i datumordning (senaste först).
- Avvikande värden markeras rött.
- Exportknapp: laddar ner historiken som CSV-fil (öppningsbar i Excel, kan
  visas vid inspektion).

## Smart-funktioner i denna version
- Varning vid temp över gränsvärdet (per enhet).
- Frivillig anteckning per loggning.
- Export av historik till CSV.

## Avgränsningar (ingår inte nu)
- Inköpslista.
- Integration mot Martin Servera.
- Molnlagring / inloggning / flera användare.
- "Vem som loggade"-fält (kan läggas till senare).

## Filstruktur
```
Bow's App/
  index.html      – appens sida och struktur
  style.css       – utseende, touch-anpassat
  app.js          – logik, lagring, export
  manifest.json   – gör att appen kan läggas till på hemskärmen
  docs/           – denna spec
```

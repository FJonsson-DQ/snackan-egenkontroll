# Bow's App – Egenkontroll

Enkel webbapp för att logga temperaturer i kyl och frys (egenkontroll/HACCP).
Allt sparas lokalt i webbläsaren, ingen server eller internet krävs.

## Så här kör du appen

### Snabbast (på datorn)
Dubbelklicka på `index.html` så öppnas appen i webbläsaren.

### På telefon eller surfplatta
Filerna behöver ligga på en webbadress för att fungera som app på hemskärmen.
Enklaste sättet under utveckling: starta en liten lokal server från den här
mappen och öppna adressen på din enhet (samma wifi).

```
python -m http.server 5173
```

Öppna sedan `http://<datorns-ip>:5173` på telefonen. I webbläsarens meny väljer
du "Lägg till på hemskärmen" för att få en app-ikon.

(När appen ska användas på riktigt lägger vi den på en gratis webbhotell-tjänst
så den alltid är tillgänglig. Det tar vi i ett senare steg.)

## Vad appen gör (version 1)

- **Enheter:** skapa namngivna kyl/frys-enheter med ett gränsvärde (max °C).
- **Logga:** skriv in uppmätt temperatur + frivillig anteckning. Värden över
  gränsen visar en röd varning men sparas ändå.
- **Historik:** se alla loggningar per enhet, avvikelser i rött, och exportera
  till CSV-fil (öppnas i Excel, bra att visa vid inspektion).

## Kommer senare

- Inköpslista med smarta funktioner
- Integration mot Martin Servera
- Eventuell molnlagring så flera kan dela samma data

Designdokument finns i `docs/`.

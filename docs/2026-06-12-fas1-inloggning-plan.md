# Fas 1: Inloggning (Google + tillåtlista) – Implementationsplan

> **För agentiska arbetare:** Stegen använder checkbox (`- [ ]`) för spårning.
> Bygger på spec `2026-06-12-delad-data-och-inloggning-design.md`.

**Goal:** Lägg till Google-inloggning via Supabase med en tillåtlista, så att appen
bara kan användas av de tre godkända e-postadresserna. Ingen befintlig funktion
ändras utöver att appen kräver inloggning.

**Architecture:** Frontend förblir en statisk HTML/CSS/JS-sida på GitHub Pages.
Supabase-klienten laddas via CDN. En heltäckande "inloggningsruta" ligger överst
och döljs först när användaren är inloggad OCH finns i tillåtlistan. I denna fas
ligger temperaturdatan kvar lokalt (localStorage); den verkliga server-spärren på
datan kommer i Fas 2 när datan flyttas till Supabase.

**Tech Stack:** Supabase (Auth + Postgres + RLS), `@supabase/supabase-js` v2 via
jsDelivr CDN, vanlig JS.

**Om testning:** Projektet har inget enhetstest-ramverk (medvetet, för enkelhet).
Verifiering sker i webbläsaren via förhandsvisningen och mot den driftsatta
GitHub Pages-länken, samt i Supabase-panelen. Google-inloggningsflödet testas
skarpt på den driftsatta länken eftersom Google kräver en riktig redirect-domän.

**Filstruktur efter Fas 1:**
- `config.js` (ny) – Supabase-projektets URL + publika anon-nyckel.
- `auth.js` (ny) – skapar Supabase-klienten, sköter session, tillåtlista, in/ut-loggning, gate.
- `index.html` (ändras) – laddar CDN + config + auth, samt inloggningsrutan.
- `style.css` (ändras) – stil för inloggnings-/ingen-åtkomst-rutan.

---

## Task 0: Skapa Supabase-projekt och hämta nycklar (manuellt – guidas)

**Filer:** inga (extern tjänst)

- [ ] **Steg 1:** Gå till https://supabase.com och skapa ett gratiskonto (logga in med GitHub går bra).
- [ ] **Steg 2:** Skapa ett nytt projekt. Välj region nära Sverige (t.ex. `eu-north-1` Stockholm eller `eu-central-1` Frankfurt). Sätt ett databaslösenord och spara det.
- [ ] **Steg 3:** Vänta tills projektet är klart (~2 min).
- [ ] **Steg 4:** Gå till Project Settings → API. Notera två värden:
  - **Project URL** (ser ut som `https://abcdefgh.supabase.co`)
  - **anon public** API-nyckel (lång sträng). Denna är publik och säker att lägga i koden.

Resultat: du har `SUPABASE_URL` och `SUPABASE_ANON_KEY` till Task 3.

---

## Task 1: Skapa tillåtlista-tabell och RLS (manuellt SQL – jag tillhandahåller)

**Filer:** inga (körs i Supabase SQL Editor)

- [ ] **Steg 1:** I Supabase, öppna SQL Editor → New query.
- [ ] **Steg 2:** Klistra in och kör följande SQL:

```sql
-- Tillåtna användare (tillåtlistan)
create table public.allowed_users (
  email text primary key,
  roll  text not null default 'anvandare'
);

-- Slå på radnivå-säkerhet
alter table public.allowed_users enable row level security;

-- En inloggad användare får bara se SIN egen rad (räcker för att avgöra åtkomst)
create policy "se egen rad"
  on public.allowed_users
  for select
  to authenticated
  using (email = auth.jwt() ->> 'email');
```

- [ ] **Steg 3:** Lägg till de tre adresserna (byt ut mot riktiga e-postadresser, gemener):

```sql
insert into public.allowed_users (email, roll) values
  ('person1@exempel.se', 'admin'),
  ('person2@exempel.se', 'anvandare'),
  ('person3@exempel.se', 'anvandare');
```

- [ ] **Steg 4 (verifiera):** Kör `select * from public.allowed_users;` och bekräfta att tre rader visas.

---

## Task 2: Aktivera Google-inloggning i Supabase (manuellt – guidas)

**Filer:** inga (Supabase + Google Cloud Console)

- [ ] **Steg 1:** I Supabase, gå till Authentication → Sign In / Providers → Google. Slå på den. Kopiera den **Callback URL** som Supabase visar (ser ut som `https://<projekt>.supabase.co/auth/v1/callback`).
- [ ] **Steg 2:** Gå till https://console.cloud.google.com → skapa ett projekt (eller välj ett befintligt).
- [ ] **Steg 3:** APIs & Services → OAuth consent screen. Välj **External**, fyll i appnamn ("Snäckan Egenkontroll") och din e-post. Spara. Lägg till de tre e-postadresserna som **Test users** (då slipper ni publiceringsgranskning).
- [ ] **Steg 4:** APIs & Services → Credentials → Create Credentials → **OAuth client ID** → Application type: **Web application**.
  - Under **Authorized redirect URIs**: klistra in Callback-URL:en från Steg 1.
- [ ] **Steg 5:** Skapa. Kopiera **Client ID** och **Client Secret**.
- [ ] **Steg 6:** Tillbaka i Supabase (Google-providern): klistra in Client ID och Client Secret. Spara.
- [ ] **Steg 7:** I Supabase, Authentication → URL Configuration:
  - **Site URL:** `https://fjonsson-dq.github.io/snackan-egenkontroll/`
  - **Redirect URLs:** lägg till samma URL och även `http://localhost:5173` (för lokal test av gränssnittet).

---

## Task 3: Lägg in config.js och Supabase-klienten i sidan

**Filer:**
- Create: `config.js`
- Modify: `index.html` (head-delen)

- [ ] **Steg 1:** Skapa `config.js` med dina värden från Task 0 (byt ut platshållarna):

```js
// Supabase-uppgifter. Anon-nyckeln är publik och säker att ha här (skyddet
// sker via Row Level Security i databasen).
window.SUPABASE_URL = 'https://DITT-PROJEKT.supabase.co';
window.SUPABASE_ANON_KEY = 'DIN-ANON-NYCKEL';
```

- [ ] **Steg 2:** I `index.html`, lägg till tre script-rader i `<head>` direkt före `</head>` (CDN först, sedan config, sedan auth):

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
  <script defer src="auth.js"></script>
```

- [ ] **Steg 3 (verifiera):** Öppna förhandsvisningen, kör i konsolen `typeof supabase` → ska bli `"object"`, och `window.SUPABASE_URL` → din URL.

---

## Task 4: Inloggningsrutan (markup + stil)

**Filer:**
- Modify: `index.html` (i `<body>`, först)
- Modify: `style.css`

- [ ] **Steg 1:** I `index.html`, lägg till denna ruta som FÖRSTA elementet inuti `<body>` (den täcker appen tills man är inloggad):

```html
  <div id="auth-gate" class="auth-gate">
    <div class="auth-box">
      <img src="icon.svg" alt="" class="auth-logo">
      <h1 class="auth-title">Snäckan</h1>
      <p class="auth-sub">Egenkontroll</p>
      <p id="auth-msg" class="auth-msg">Logga in för att fortsätta.</p>
      <button id="google-login" class="btn btn-primary btn-block">Logga in med Google</button>
      <button id="auth-logout" class="btn btn-block hidden">Logga ut</button>
    </div>
  </div>
```

- [ ] **Steg 2:** Lägg till i `style.css`:

```css
/* Inloggningsruta */
.auth-gate {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.auth-gate.hidden { display: none; }
.auth-box {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 28px 22px;
  width: 100%;
  max-width: 360px;
  text-align: center;
}
.auth-logo { width: 72px; height: 72px; border-radius: 18px; }
.auth-title { font-family: var(--font-serif, serif); margin: 14px 0 0; font-size: 1.5rem; }
.auth-sub { color: var(--green-deep); letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.75rem; margin: 2px 0 18px; }
.auth-msg { color: var(--muted); margin: 0 0 18px; }
.auth-msg.error { color: var(--red); }
```

- [ ] **Steg 3 (verifiera):** Ladda om förhandsvisningen. Inloggningsrutan ska täcka skärmen med logga, "Snäckan", och knappen "Logga in med Google".

---

## Task 5: auth.js – klient, session och in/ut-loggning

**Filer:**
- Create: `auth.js`

- [ ] **Steg 1:** Skapa `auth.js`:

```js
// Skapar Supabase-klienten och styr inloggningsrutan (gate).
// Exponerar window.sb för Fas 2 (datalagring).
window.sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const gate = document.getElementById('auth-gate');
const msg = document.getElementById('auth-msg');
const loginBtn = document.getElementById('google-login');
const logoutBtn = document.getElementById('auth-logout');

function showLogin() {
  gate.classList.remove('hidden');
  msg.textContent = 'Logga in för att fortsätta.';
  msg.classList.remove('error');
  loginBtn.classList.remove('hidden');
  logoutBtn.classList.add('hidden');
}

function showNoAccess(email) {
  gate.classList.remove('hidden');
  msg.textContent = `Kontot ${email} har inte åtkomst. Kontakta administratören.`;
  msg.classList.add('error');
  loginBtn.classList.add('hidden');
  logoutBtn.classList.remove('hidden');
}

function showApp() {
  gate.classList.add('hidden');
}

loginBtn.addEventListener('click', async () => {
  await window.sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
});

logoutBtn.addEventListener('click', async () => {
  await window.sb.auth.signOut();
  showLogin();
});
```

- [ ] **Steg 2 (verifiera):** Ladda om förhandsvisningen, kontrollera i konsolen att inga fel syns och att `window.sb` finns (`typeof window.sb` → `"object"`).

---

## Task 6: Tillåtlista-kontroll och sessionsutvärdering

**Filer:**
- Modify: `auth.js` (lägg till nedanför koden från Task 5)

- [ ] **Steg 1:** Lägg till i `auth.js`:

```js
// Slår upp den inloggades egen rad i tillåtlistan. Returnerar true om åtkomst.
async function isAllowed(email) {
  const { data, error } = await window.sb
    .from('allowed_users')
    .select('email')
    .eq('email', email)
    .maybeSingle();
  if (error) {
    console.error('Tillåtlista-fel:', error);
    return false;
  }
  return !!data;
}

// Avgör vad som ska visas utifrån aktuell session.
async function evaluateSession() {
  const { data: { session } } = await window.sb.auth.getSession();
  if (!session) { showLogin(); return; }
  const email = session.user.email;
  if (await isAllowed(email)) {
    showApp();
  } else {
    showNoAccess(email);
  }
}

// Kör vid start och varje gång inloggningsstatus ändras (t.ex. efter redirect).
evaluateSession();
window.sb.auth.onAuthStateChange(() => evaluateSession());
```

- [ ] **Steg 2 (verifiera lokalt):** Ladda om. Eftersom du inte är inloggad ska inloggningsrutan visas med Google-knappen. (Själva Google-flödet testas skarpt i Task 8.)

---

## Task 7: Driftsätt och förbered skarp test

**Filer:**
- Modify: `index.html`, plus nya `config.js`, `auth.js` (commit)

- [ ] **Steg 1:** Kontrollera att `config.js` har dina riktiga värden (inte platshållare).
- [ ] **Steg 2:** Commit och push:

```bash
git add -A
git commit -m "Fas 1: Google-inloggning med tillatlista"
git push
```

- [ ] **Steg 3:** Vänta ~1 min på att GitHub Pages bygger om.

---

## Task 8: Skarp verifiering (på den driftsatta länken)

**Filer:** inga

- [ ] **Steg 1:** Öppna https://fjonsson-dq.github.io/snackan-egenkontroll/ . Inloggningsrutan ska visas.
- [ ] **Steg 2:** Tryck "Logga in med Google" och logga in med en av de **tre godkända** adresserna. Efter redirect ska rutan försvinna och appen visas.
- [ ] **Steg 3:** Ladda om sidan – du ska fortfarande vara inloggad (rutan visas inte igen).
- [ ] **Steg 4 (negativt test):** Öppna i ett privat fönster, logga in med ett **icke godkänt** Google-konto. Du ska se "Kontot ... har inte åtkomst" och en "Logga ut"-knapp, och INTE komma in i appen.
- [ ] **Steg 5:** Tryck "Logga ut" och bekräfta att du återgår till inloggningsrutan.
- [ ] **Steg 6:** Mobiltest: öppna länken på mobilen och logga in. Bekräfta att flödet fungerar på touch.

---

## Task 9: Liten städning

**Filer:**
- Modify: `README.md`

- [ ] **Steg 1:** Lägg till en kort rad i `README.md` om att appen nu kräver Google-inloggning och att tillåtna användare styrs i Supabase-tabellen `allowed_users`.
- [ ] **Steg 2:** Commit och push:

```bash
git add README.md
git commit -m "Dokumentera inloggning i README"
git push
```

---

## Självgranskning mot spec

- **Delad data:** påbörjas inte här (Fas 2) – avsiktligt. Denna plan rör endast inloggning.
- **Google-inloggning:** Task 2, 5.
- **Tillåtlista + RLS på serversidan:** Task 1 (tabell + policy), Task 6 (klientkontroll).
- **Stängt system / ingen öppen registrering:** Google Test users (Task 2 steg 3) + tillåtlista (Task 1). Ej godkända konton nekas (Task 8 steg 4).
- **anon-nyckel i frontend är OK:** Task 3 (kommenterat i config.js).
- **Inga platshållare i kod:** config.js har medvetna platshållare som användaren fyller i (URL/nyckel) – dessa är data, inte kodlogik.
- **Namnkonsekvens:** `window.sb`, `allowed_users`, `isAllowed`, `evaluateSession`, gate-id `auth-gate` används konsekvent genom planen.

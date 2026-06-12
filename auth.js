// Skapar Supabase-klienten och styr inloggningsrutan (gate).
// Exponerar window.sb för Fas 2 (datalagring).
// Implicit-flödet: Google skickar tillbaka inloggningen direkt i URL:ens #-del,
// så ingen "code verifier" behöver sparas i förväg. Det gör inloggningen robust
// även när man loggar in från olika enheter eller appen på hemskärmen.
// persistSession sparar sessionen så man förblir inloggad efter omladdning.
window.sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'implicit',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const gate = document.getElementById('auth-gate');
const authMsg = document.getElementById('auth-msg');
const loginBtn = document.getElementById('google-login');
const logoutBtn = document.getElementById('auth-logout');

// Optimistiskt: finns redan en sparad session, dölj rutan direkt så den inte
// blinkar förbi vid omladdning. evaluateSession bekräftar strax efter.
try {
  if (localStorage.getItem(window.sb.auth.storageKey)) gate.classList.add('hidden');
} catch (e) {}

function showLogin() {
  gate.classList.remove('hidden');
  authMsg.textContent = 'Logga in för att fortsätta.';
  authMsg.classList.remove('error');
  loginBtn.classList.remove('hidden');
  logoutBtn.classList.add('hidden');
}

function showNoAccess(email) {
  gate.classList.remove('hidden');
  authMsg.textContent = `Kontot ${email} har inte åtkomst. Kontakta administratören.`;
  authMsg.classList.add('error');
  loginBtn.classList.add('hidden');
  logoutBtn.classList.remove('hidden');
}

function showApp() {
  gate.classList.add('hidden');
}

loginBtn.addEventListener('click', async () => {
  // Ren adress utan ev. gammal ?code= eller #-rester.
  const cleanUrl = window.location.origin + window.location.pathname;
  await window.sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: cleanUrl },
  });
});

logoutBtn.addEventListener('click', async () => {
  await window.sb.auth.signOut();
  showLogin();
});

// Utloggningsknapp i appens header (visas när man är inloggad).
const headerLogoutBtn = document.getElementById('header-logout');
if (headerLogoutBtn) {
  headerLogoutBtn.addEventListener('click', async () => {
    await window.sb.auth.signOut();
    showLogin();
  });
}

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

function showLoggingIn() {
  gate.classList.remove('hidden');
  authMsg.textContent = 'Loggar in…';
  authMsg.classList.remove('error');
  loginBtn.classList.add('hidden');
  logoutBtn.classList.add('hidden');
}

function showError(text) {
  gate.classList.remove('hidden');
  authMsg.textContent = text;
  authMsg.classList.add('error');
  loginBtn.classList.remove('hidden');
  logoutBtn.classList.add('hidden');
}

// Implicit-flödet lägger tokens (eller fel) i URL:ens #-del. supabase-js läser
// och rensar dem automatiskt vid start; här visar vi bara rätt status.
async function start() {
  const hash = window.location.hash || '';
  if (hash.includes('error')) {
    const params = new URLSearchParams(hash.slice(1));
    console.error('Inloggningsfel:', params.get('error_description') || params.get('error'));
    showError('Inloggningen avbröts eller misslyckades. Försök igen.');
    return;
  }
  if (hash.includes('access_token')) showLoggingIn();
  await evaluateSession();
}

start();
window.sb.auth.onAuthStateChange((event) => {
  // start() sköter initialläget; reagera bara på senare ändringar.
  if (event === 'INITIAL_SESSION') return;
  evaluateSession();
});

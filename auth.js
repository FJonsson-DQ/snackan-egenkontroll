// Skapar Supabase-klienten och styr inloggningsrutan (gate).
// Exponerar window.sb för Fas 2 (datalagring).
// PKCE-flödet (i stället för det gamla "implicit") sparar sessionen korrekt så
// att man förblir inloggad efter en omladdning.
window.sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // vi växlar in koden manuellt (se start())
  },
});

const gate = document.getElementById('auth-gate');
const authMsg = document.getElementById('auth-msg');
const loginBtn = document.getElementById('google-login');
const logoutBtn = document.getElementById('auth-logout');

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

// Växlar in ?code= från Google-redirekten till en session och rensar adressen.
async function handleOAuthRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return;
  showLoggingIn();
  const { error } = await window.sb.auth.exchangeCodeForSession(code);
  url.searchParams.delete('code');
  window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  if (error) {
    console.error('Inloggningsfel:', error);
    showError('Inloggningen kunde inte slutföras. Tryck och försök igen.');
  }
}

async function start() {
  await handleOAuthRedirect();
  await evaluateSession();
}

start();
window.sb.auth.onAuthStateChange((event) => {
  // start() sköter initialläget; reagera bara på senare ändringar.
  if (event === 'INITIAL_SESSION') return;
  evaluateSession();
});

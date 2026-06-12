// Skapar Supabase-klienten och styr inloggningsrutan (gate).
// Exponerar window.sb för Fas 2 (datalagring).
window.sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

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
  await window.sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
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

evaluateSession();
window.sb.auth.onAuthStateChange(() => evaluateSession());

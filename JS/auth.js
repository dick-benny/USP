import { supabase } from './supabase.js';

let currentUser = null;
let appLoaded = false;

function setAuthMessage(message = '') {
  const el = document.getElementById('authError');
  if (el) el.textContent = message;
}

function toggleViews(isAuthenticated) {
  const authView = document.getElementById('authView');
  const appView = document.getElementById('appView');

  if (authView) {
    authView.hidden = isAuthenticated;
    authView.style.display = isAuthenticated ? 'none' : '';
  }

  if (appView) {
    appView.hidden = !isAuthenticated;
    appView.style.display = isAuthenticated ? '' : 'none';
  }
}

function fillUserUi(user) {
  const badge = document.getElementById('userBadge');
  if (!badge) return;
  badge.textContent = user
    ? `${user.initials || '??'}`
    : '--';
}

function mapProfile(profile, authUser) {
  return {
    id: authUser.id,
    email: authUser.email || profile?.email || '',
    fullName: profile?.full_name || '',
    initials: profile?.initials || '',
    role: profile?.role || 'user',
    isAdmin: profile?.role === 'admin',
    isActive: profile?.is_active !== false
  };
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('planning_users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Ingen profil hittades.');
  return data;
}

async function loadAppIfNeeded() {
  if (appLoaded) return;
  appLoaded = true;
  await import('./app.js?v=111');
}

async function enterApp(user) {
  currentUser = user;
  window.CurrentUser = user;
  fillUserUi(user);
  toggleViews(true);
  await loadAppIfNeeded();
}

async function resolveUser(authUser) {
  if (!authUser?.id) return null;

  const profile = await getProfile(authUser.id);
  const mapped = mapProfile(profile, authUser);

  if (!mapped.isActive) {
    throw new Error('Användaren är inaktiv.');
  }

  return mapped;
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    setAuthMessage(error.message);
    return;
  }

  currentUser = null;
  window.CurrentUser = null;
  fillUserUi(null);
  toggleViews(false);
  setAuthMessage('');
}

function bindLogout() {
  const button = document.getElementById('logoutButton');
  if (!button || button.dataset.bound) return;

  button.dataset.bound = 'true';
  button.addEventListener('click', signOutUser);
}

function bindLoginForm() {
  const form = document.getElementById('authForm');
  if (!form || form.dataset.bound) return;

  form.dataset.bound = 'true';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setAuthMessage('');

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const submit = document.getElementById('authSubmit');

    if (!email || !password) {
      setAuthMessage('Fyll i e-post och lösenord.');
      return;
    }

    if (submit) submit.disabled = true;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const user = await resolveUser(data.user);
      await enterApp(user);

      form.reset();
    } catch (err) {
      setAuthMessage(err.message || 'Login misslyckades.');
      toggleViews(false);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

export async function bootstrapAuth() {
  bindLoginForm();
  bindLogout();

  try {
    const { data } = await supabase.auth.getSession();
    const authUser = data?.session?.user;

    if (!authUser) {
      toggleViews(false);
      return;
    }

    const user = await resolveUser(authUser);
    await enterApp(user);
  } catch (err) {
    setAuthMessage(err.message || 'Session error');
    toggleViews(false);
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    window.CurrentUser = null;
    fillUserUi(null);
    toggleViews(false);
  }
});

export function getCurrentUser() {
  return currentUser;
}

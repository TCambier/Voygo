import { supabaseAuth, getSupabaseForUser } from '../services/supabase.js';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js';

function buildUserPayload(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    first_name: user.user_metadata?.first_name || '',
    last_name: user.user_metadata?.last_name || ''
  };
}

export async function signup(req, res) {
  const { first_name, last_name, email, password } = req.body || {};
  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'Champs manquants.' });
  }

  const { data, error } = await supabaseAuth.auth.signUp({
    email,
    password,
    options: {
      data: { first_name, last_name }
    }
  });

  if (error) {
    return res.status(400).json({ error: error.message || 'Inscription impossible.' });
  }

  if (data?.session) {
    setAuthCookies(res, data.session);
  }

  return res.json({
    user: buildUserPayload(data?.user),
    needsConfirmation: !data?.session
  });
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email ou mot de passe manquant.' });
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }

  setAuthCookies(res, data.session);
  return res.json({ user: buildUserPayload(data.user) });
}

export async function me(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifie.' });
  }
  return res.json({ user: buildUserPayload(req.user) });
}

export async function logout(req, res) {
  clearAuthCookies(res);
  return res.json({ success: true });
}

export async function emailExists(req, res) {
  const email = req.query.email || req.body?.email;
  if (!email) {
    return res.status(400).json({ error: 'Email manquant.' });
  }

  try {
    const { data, error } = await supabaseAuth.rpc('auth_email_exists', { email_to_check: email });
    if (!error) {
      return res.json({ exists: Boolean(data) });
    }
  } catch (err) {
    // ignore
  }

  return res.json({ exists: false });
}

export async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email manquant.' });
  }

  const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  const redirectTo = `${origin}/reset-password.html`;

  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    return res.status(400).json({ error: error.message || "Envoi de l'email impossible." });
  }

  return res.json({ success: true });
}

export async function resetPassword(req, res) {
  const { accessToken, password } = req.body || {};
  if (!accessToken || !password) {
    return res.status(400).json({ error: 'Token ou mot de passe manquant.' });
  }

  const client = getSupabaseForUser(accessToken);
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  return res.json({ success: true });
}

export async function updateProfile(req, res) {
  const { first_name, last_name } = req.body || {};
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'Prenom et nom requis.' });
  }

  const client = getSupabaseForUser(req.accessToken);
  const { data, error } = await client.auth.updateUser({
    data: { first_name, last_name }
  });

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  return res.json({ user: buildUserPayload(data?.user) });
}

export async function updateEmail(req, res) {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email requis.' });
  }

  const client = getSupabaseForUser(req.accessToken);
  const { error } = await client.auth.updateUser({ email });

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  return res.json({ success: true });
}

export async function updatePassword(req, res) {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Mot de passe requis.' });
  }

  const client = getSupabaseForUser(req.accessToken);
  const { error } = await client.auth.updateUser({ password });

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  return res.json({ success: true });
}

export async function deleteAccount(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const { error } = await client.functions.invoke('delete-account');
  if (error) {
    return res.status(400).json({
      error: "Impossible de supprimer le compte. Configurez la fonction 'delete-account' cote serveur."
    });
  }

  clearAuthCookies(res);
  return res.json({ success: true });
}

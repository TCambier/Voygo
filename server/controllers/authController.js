/**
 * @voygo-doc
 * Module: authController
 * Fichier: server\controllers\authController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { supabaseAuth, supabaseAdmin, getSupabaseForUser } from '../services/supabase.js';
import { setAuthCookies, clearAuthCookies, isServerSessionValid } from '../utils/cookies.js';
import { config } from '../config.js';

const NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

// Verifie la condition exposee par 'isMissingTableError'.
function isMissingTableError(error) {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  if (code === '42P01' || code === 'PGRST106') return true;
  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return (
    message.includes('does not exist') ||
    (message.includes('relation') && message.includes('not found')) ||
    message.includes('schema cache') ||
    (message.includes('not found') && message.includes('schema'))
  );
}

// Supprime les donnees ciblees par 'deleteAllUserData'.
async function deleteAllUserData(client, userId) {
  const tables = [
    'transports',
    'activities',
    'accommodations',
    'budgets',
    'notes',
    'calendar_entries',
    'markers',
    'logements',
    'activites',
    'trips'
  ];

  for (const table of tables) {
    const { error } = await client
      .from(table)
      .delete()
      .eq('user_id', userId);

    if (error && !isMissingTableError(error)) {
      throw new Error(error.message || `Suppression impossible (${table}).`);
    }
  }
}

// Gere la logique principale de 'buildUserPayload'.
function buildUserPayload(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    first_name: user.user_metadata?.first_name || '',
    last_name: user.user_metadata?.last_name || ''
  };
}

// Verifie la condition exposee par 'isUserAlreadyDeleted'.
function isUserAlreadyDeleted(errorMessage = '') {
  const message = String(errorMessage || '').toLowerCase();
  return message.includes('user not found') || message.includes('not found');
}

// Verifie la condition exposee par 'isAuthSessionMissingError'.
function isAuthSessionMissingError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('auth session missing');
}

// Verifie la condition exposee par 'isStrongPassword'.
function isStrongPassword(password = '') {
  const pwd = String(password);
  const hasUpperCase = /[A-Z]/.test(pwd);
  const hasLowerCase = /[a-z]/.test(pwd);
  const hasNumbers = /\d/.test(pwd);
  const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);

  return hasUpperCase && hasLowerCase && hasNumbers && hasSymbols;
}

// Verifie si une chaine contient des motifs HTML/JS suspects.
function hasScriptLikeContent(value = '') {
  const input = String(value || '');
  return (
    /<[^>]*>/.test(input) ||
    /javascript\s*:/i.test(input) ||
    /on[a-z]+\s*=/i.test(input)
  );
}

// Verifie la condition exposee par 'hasControlChars'.
function hasControlChars(value = '') {
  return /[\u0000-\u001F\u007F]/.test(String(value || ''));
}

// Gere la logique principale de 'sanitizeName'.
function sanitizeName(value, fieldLabel) {
  if (typeof value !== 'string') {
    return { error: `${fieldLabel} invalide.` };
  }

  const name = value.trim();
  if (!name) {
    return { error: `${fieldLabel} requis.` };
  }

  if (name.length > NAME_MAX_LENGTH) {
    return { error: `${fieldLabel} trop long.` };
  }

  if (hasControlChars(name) || hasScriptLikeContent(name)) {
    return { error: `${fieldLabel} contient des caracteres interdits.` };
  }

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(name)) {
    return { error: `${fieldLabel} contient des caracteres non autorises.` };
  }

  return { value: name };
}

// Gere la logique principale de 'sanitizeEmail'.
function sanitizeEmail(value) {
  if (typeof value !== 'string') {
    return { error: 'Email invalide.' };
  }

  const email = value.trim().toLowerCase();
  if (!email) {
    return { error: 'Email manquant.' };
  }

  if (email.length > EMAIL_MAX_LENGTH) {
    return { error: 'Email trop long.' };
  }

  if (hasControlChars(email) || hasScriptLikeContent(email)) {
    return { error: 'Email contient des caracteres interdits.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Format email invalide.' };
  }

  return { value: email };
}

// Gere la logique principale de 'sanitizeSignupPassword'.
function sanitizeSignupPassword(value) {
  if (typeof value !== 'string') {
    return { error: 'Mot de passe invalide.' };
  }

  const password = value;

  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return {
      error: `Le mot de passe doit contenir entre ${PASSWORD_MIN_LENGTH} et ${PASSWORD_MAX_LENGTH} caracteres.`
    };
  }

  if (hasControlChars(password) || hasScriptLikeContent(password)) {
    return { error: 'Mot de passe contient des caracteres interdits.' };
  }

  if (!isStrongPassword(password)) {
    return {
      error: 'Le mot de passe doit contenir au minimum une majuscule, une minuscule, un chiffre et un symbole.'
    };
  }

  return { value: password };
}

// Applique les mises a jour de 'validateSignupPayload'.
function validateSignupPayload(payload = {}) {
  const firstNameCheck = sanitizeName(payload.first_name, 'Prenom');
  if (firstNameCheck.error) return { error: firstNameCheck.error };

  const lastNameCheck = sanitizeName(payload.last_name, 'Nom');
  if (lastNameCheck.error) return { error: lastNameCheck.error };

  const emailCheck = sanitizeEmail(payload.email);
  if (emailCheck.error) return { error: emailCheck.error };

  const passwordCheck = sanitizeSignupPassword(payload.password);
  if (passwordCheck.error) return { error: passwordCheck.error };

  return {
    value: {
      first_name: firstNameCheck.value,
      last_name: lastNameCheck.value,
      email: emailCheck.value,
      password: passwordCheck.value
    }
  };
}

// Retourne les tokens d'auth presents dans la requete.
function extractAuthTokens(req) {
  const header = req.headers.authorization || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null;

  return {
    accessToken: req.cookies?.voygo_access_token || bearerToken || null,
    refreshToken: req.cookies?.voygo_refresh_token || null
  };
}

// Revoque la session cote fournisseur d'auth.
async function revokeSessionViaAuthApi(accessToken) {
  if (!accessToken) {
    return { ok: false, reason: 'missing_access_token' };
  }

  const response = await fetch(`${config.supabaseUrl}/auth/v1/logout?scope=global`, {
    method: 'POST',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.ok) {
    return { ok: true };
  }

  const body = await response.json().catch(() => null);
  return {
    ok: false,
    status: response.status,
    error: body?.msg || body?.error_description || body?.error || `HTTP ${response.status}`
  };
}

// Supprime les donnees ciblees par 'deleteAuthUserViaAdminRest'.
async function deleteAuthUserViaAdminRest(userId) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: `Bearer ${config.supabaseServiceRoleKey}`
    }
  });

  const body = await response.json().catch(() => null);
  const errorMessage =
    body?.msg || body?.error_description || body?.error || `HTTP ${response.status}`;

  return {
    ok: response.ok,
    errorMessage,
    status: response.status,
    body
  };
}

// Met a jour l'utilisateur auth via REST avec un access token utilisateur.
async function updateAuthUserViaRest(accessToken, payload) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });

  const body = await response.json().catch(() => null);
  const errorMessage =
    body?.msg || body?.error_description || body?.error || `HTTP ${response.status}`;

  return {
    ok: response.ok,
    status: response.status,
    body,
    errorMessage
  };
}

// Rafraichit la session courante via le refresh token cookie.
async function refreshAccessTokenFromRequest(req, res) {
  const { refreshToken } = extractAuthTokens(req);
  if (!refreshToken) {
    return { ok: false, error: 'Refresh token manquant.' };
  }

  const { data, error } = await supabaseAuth.auth.refreshSession({
    refresh_token: refreshToken
  });

  if (error || !data?.session?.access_token) {
    clearAuthCookies(res);
    return {
      ok: false,
      error: error?.message || 'Session expiree. Veuillez vous reconnecter.'
    };
  }

  setAuthCookies(res, data.session);
  return {
    ok: true,
    accessToken: data.session.access_token,
    user: data.user || null
  };
}

// Met a jour l'utilisateur auth et retente apres refresh en cas de session manquante.
async function updateAuthUserWithAutoRefresh(req, res, payload) {
  const firstTry = await updateAuthUserViaRest(req.accessToken, payload);
  if (firstTry.ok) {
    return firstTry;
  }

  if (!isAuthSessionMissingError(firstTry.errorMessage)) {
    return firstTry;
  }

  const refreshed = await refreshAccessTokenFromRequest(req, res);
  if (!refreshed.ok) {
    return {
      ok: false,
      status: 401,
      errorMessage: refreshed.error,
      body: null
    };
  }

  const secondTry = await updateAuthUserViaRest(refreshed.accessToken, payload);
  if (secondTry.ok) {
    req.accessToken = refreshed.accessToken;
    return secondTry;
  }

  return secondTry;
}

// Gere la logique principale de 'signup'.
export async function signup(req, res) {
  const validation = validateSignupPayload(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  const { first_name, last_name, email, password } = validation.value;

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

// Gere la logique principale de 'login'.
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

// Gere la logique principale de 'me'.
export async function me(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: 'Non authentifie.' });
  }
  return res.json({ user: buildUserPayload(req.user) });
}

// Gere la logique principale de 'logout'.
export async function logout(req, res) {
  const { accessToken } = extractAuthTokens(req);

  if (accessToken) {
    try {
      const revokeResult = await revokeSessionViaAuthApi(accessToken);
      if (!revokeResult.ok && revokeResult.reason !== 'missing_access_token') {
        console.warn('[auth/logout] session revocation failed', revokeResult);
      }
    } catch (error) {
      console.warn('[auth/logout] session revocation request failed', {
        message: error?.message || 'unknown_error'
      });
    }
  }

  clearAuthCookies(res);
  return res.json({ success: true });
}

// Gere la logique principale de 'refreshSession'.
export async function refreshSession(req, res) {
  if (!isServerSessionValid(req)) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Session redemarree. Veuillez vous reconnecter.' });
  }

  const { refreshToken } = extractAuthTokens(req);
  if (!refreshToken) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Refresh token manquant.' });
  }

  const { data, error } = await supabaseAuth.auth.refreshSession({
    refresh_token: refreshToken
  });

  if (error || !data?.session) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Session expiree. Veuillez vous reconnecter.' });
  }

  setAuthCookies(res, data.session);
  return res.json({
    success: true,
    user: buildUserPayload(data.user)
  });
}

// Gere la logique principale de 'emailExists'.
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

// Gere la logique principale de 'forgotPassword'.
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

// Gere la logique principale de 'resetPassword'.
export async function resetPassword(req, res) {
  const { accessToken, password } = req.body || {};
  if (!accessToken || !password) {
    return res.status(400).json({ error: 'Token ou mot de passe manquant.' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'Le mot de passe doit contenir au minimum une majuscule, une minuscule, un chiffre et un symbole.'
    });
  }

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(400).json({ error: 'Lien de reinitialisation invalide ou expire.' });
  }

  if (supabaseAdmin) {
    const { error: adminError } = await supabaseAdmin.auth.admin.updateUserById(userData.user.id, {
      password
    });

    if (adminError) {
      return res.status(400).json({ error: adminError.message || 'Mise a jour impossible.' });
    }

    return res.json({ success: true });
  }

  const client = getSupabaseForUser(accessToken);
  const { error } = await client.auth.updateUser({ password });
  if (!error) {
    return res.json({ success: true });
  }

  const fallbackResponse = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });

  const fallbackBody = await fallbackResponse
    .json()
    .catch(() => null);

  if (!fallbackResponse.ok) {
    return res.status(400).json({
      error:
        fallbackBody?.msg ||
        fallbackBody?.error_description ||
        fallbackBody?.error ||
        error.message ||
        'Mise a jour impossible.'
    });
  }

  return res.json({ success: true });
}

// Applique les mises a jour de 'updateProfile'.
export async function updateProfile(req, res) {
  const { first_name, last_name } = req.body || {};
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'Prenom et nom requis.' });
  }

  const fallback = await updateAuthUserWithAutoRefresh(req, res, {
    data: { first_name, last_name }
  });

  if (!fallback.ok) {
    const status = fallback.status === 401 ? 401 : 400;
    return res.status(status).json({
      error: fallback.errorMessage || 'Mise a jour impossible.'
    });
  }

  return res.json({ user: buildUserPayload(fallback.body) });
}

// Applique les mises a jour de 'updateEmail'.
export async function updateEmail(req, res) {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email requis.' });
  }

  const fallback = await updateAuthUserWithAutoRefresh(req, res, { email });
  if (!fallback.ok) {
    const status = fallback.status === 401 ? 401 : 400;
    return res.status(status).json({
      error: fallback.errorMessage || 'Mise a jour impossible.'
    });
  }

  return res.json({ success: true });
}

// Applique les mises a jour de 'updatePassword'.
export async function updatePassword(req, res) {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Mot de passe requis.' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'Le mot de passe doit contenir au minimum une majuscule, une minuscule, un chiffre et un symbole.'
    });
  }

  const fallback = await updateAuthUserWithAutoRefresh(req, res, { password });
  if (!fallback.ok) {
    const status = fallback.status === 401 ? 401 : 400;
    return res.status(status).json({
      error: fallback.errorMessage || 'Mise a jour impossible.'
    });
  }

  return res.json({ success: true });
}

// Supprime les donnees ciblees par 'deleteAccount'.
export async function deleteAccount(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const userId = req.user.id;

  try {
    await deleteAllUserData(client, userId);
  } catch (error) {
    return res.status(400).json({
      error: error.message || 'Impossible de supprimer les donnees liees au compte.'
    });
  }

  if (supabaseAdmin) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error('[auth/delete] admin.deleteUser failed', {
        userId,
        message: error.message,
        code: error.code || null,
        status: error.status || null,
        name: error.name || null
      });

      if (!isUserAlreadyDeleted(error.message)) {
        const restResult = await deleteAuthUserViaAdminRest(userId);
        if (!restResult.ok && !isUserAlreadyDeleted(restResult.errorMessage)) {
          return res.status(400).json({
            error:
              `${error.message || 'Impossible de supprimer le compte auth.'}` +
              ` (code: ${error.code || 'n/a'}) ; REST fallback: ${restResult.errorMessage}`
          });
        }
      }
    }
  } else {
    const { error } = await client.functions.invoke('delete-account');
    if (error) {
      console.error('[auth/delete] edge function fallback failed', {
        userId,
        message: error.message,
        name: error.name || null,
        context: error.context || null,
        details: error.details || null
      });
      return res.status(400).json({
        error:
          "Impossible de supprimer le compte auth. SUPABASE_SERVICE_ROLE_KEY n'est pas active dans le serveur en cours (redemarrage requis) ou la fonction 'delete-account' n'est pas deployeee."
      });
    }
  }

  try {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) {
      // We still clear server cookies below to finish local logout.
    }
  } catch (err) {
    // Ignore sign-out failures because account deletion already succeeded.
  }

  clearAuthCookies(res);
  return res.json({ success: true });
}

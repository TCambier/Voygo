/**
 * @voygo-doc
 * Module: auth
 * Fichier: server\middleware\auth.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { supabaseAuth } from '../services/supabase.js';

// Gere la logique principale de 'requireAuth'.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = req.cookies?.voygo_access_token || bearer;

  if (!token) {
    return res.status(401).json({ error: 'Non authentifie.' });
  }

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Session invalide.' });
    }
    req.user = data.user;
    req.accessToken = token;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Session invalide.' });
  }
}

import { supabaseAuth } from '../services/supabase.js';

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

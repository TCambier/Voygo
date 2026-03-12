import { getSupabaseForUser } from '../services/supabase.js';

export async function listResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const { data, error } = await client
    .from(req.resourceTable)
    .select('*')
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(400).json({ error: error.message || 'Chargement impossible.' });
  }

  return res.json({ data: data || [] });
}

export async function createResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const payload = req.body || {};

  const { data, error } = await client
    .from(req.resourceTable)
    .insert({ ...payload, user_id: req.user.id })
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Creation impossible.' });
  }

  return res.status(201).json({ data });
}

export async function updateResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const payload = req.body || {};

  const { data, error } = await client
    .from(req.resourceTable)
    .update(payload)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  return res.json({ data });
}

export async function deleteResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);

  const { error } = await client
    .from(req.resourceTable)
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(400).json({ error: error.message || 'Suppression impossible.' });
  }

  return res.json({ success: true });
}

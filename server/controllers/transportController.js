import { getSupabaseForUser } from '../services/supabase.js';

export async function listTransports(req, res) {
  const { tripId } = req.params;
  const client = getSupabaseForUser(req.accessToken);

  const { data, error } = await client
    .from('transports')
    .select('id,origin,destination,travel_date,mode,price,duration_minutes,created_at,trip_id')
    .eq('trip_id', tripId)
    .eq('user_id', req.user.id)
    .order('travel_date', { ascending: true });

  if (error) {
    return res.status(400).json({ error: error.message || 'Chargement impossible.' });
  }

  return res.json({ data: data || [] });
}

export async function createTransport(req, res) {
  const { tripId } = req.params;
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);

  const insertPayload = {
    ...payload,
    trip_id: tripId,
    user_id: req.user.id
  };

  const { data, error } = await client
    .from('transports')
    .insert(insertPayload)
    .select('id,origin,destination,travel_date,mode,price,duration_minutes,created_at,trip_id')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Creation impossible.' });
  }

  return res.status(201).json({ data });
}

export async function updateTransport(req, res) {
  const { id } = req.params;
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);

  const { data, error } = await client
    .from('transports')
    .update(payload)
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select('id,origin,destination,travel_date,mode,price,duration_minutes,created_at,trip_id')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  return res.json({ data });
}

export async function deleteTransport(req, res) {
  const { id } = req.params;
  const client = getSupabaseForUser(req.accessToken);

  const { error } = await client
    .from('transports')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(400).json({ error: error.message || 'Suppression impossible.' });
  }

  return res.json({ success: true });
}

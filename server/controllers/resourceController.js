import { getSupabaseForUser } from '../services/supabase.js';
import { getAccessDbClient, getTripAccess } from '../utils/tripAccess.js';

export async function listResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);
  const tripId = String(req.query.tripId || '').trim();

  let query = db.from(req.resourceTable).select('*');

  if (tripId) {
    let access;
    try {
      access = await getTripAccess(db, tripId, req.user.id);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
    }

    if (!access) {
      return res.status(404).json({ error: 'Voyage introuvable.' });
    }

    query = query.eq('trip_id', tripId);
  } else {
    query = query.eq('user_id', req.user.id);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(400).json({ error: error.message || 'Chargement impossible.' });
  }

  return res.json({ data: data || [] });
}

export async function createResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);
  const payload = req.body || {};

  let insertPayload = { ...payload, user_id: req.user.id };

  if (payload.trip_id) {
    let access;
    try {
      access = await getTripAccess(db, payload.trip_id, req.user.id);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
    }

    if (!access) {
      return res.status(404).json({ error: 'Voyage introuvable.' });
    }

    if (!access.canEdit) {
      return res.status(403).json({ error: 'Ce voyage est en lecture seule.' });
    }

    insertPayload = { ...payload, user_id: access.trip.user_id };
  }

  const { data, error } = await db
    .from(req.resourceTable)
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Creation impossible.' });
  }

  return res.status(201).json({ data });
}

export async function updateResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);
  const payload = req.body || {};

  const { data: existing, error: existingError } = await db
    .from(req.resourceTable)
    .select('id,trip_id,user_id')
    .eq('id', req.params.id)
    .single();

  if (existingError || !existing) {
    return res.status(404).json({ error: 'Element introuvable.' });
  }

  if (existing.trip_id) {
    let access;
    try {
      access = await getTripAccess(db, existing.trip_id, req.user.id);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
    }

    if (!access) {
      return res.status(404).json({ error: 'Voyage introuvable.' });
    }

    if (!access.canEdit) {
      return res.status(403).json({ error: 'Ce voyage est en lecture seule.' });
    }
  } else if (String(existing.user_id) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Acces refuse.' });
  }

  const { data, error } = await db
    .from(req.resourceTable)
    .update(payload)
    .eq('id', req.params.id)
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  return res.json({ data });
}

export async function deleteResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  const { data: existing, error: existingError } = await db
    .from(req.resourceTable)
    .select('id,trip_id,user_id')
    .eq('id', req.params.id)
    .single();

  if (existingError || !existing) {
    return res.status(404).json({ error: 'Element introuvable.' });
  }

  if (existing.trip_id) {
    let access;
    try {
      access = await getTripAccess(db, existing.trip_id, req.user.id);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
    }

    if (!access) {
      return res.status(404).json({ error: 'Voyage introuvable.' });
    }

    if (!access.canEdit) {
      return res.status(403).json({ error: 'Ce voyage est en lecture seule.' });
    }
  } else if (String(existing.user_id) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Acces refuse.' });
  }

  const { error } = await db
    .from(req.resourceTable)
    .delete()
    .eq('id', req.params.id);

  if (error) {
    return res.status(400).json({ error: error.message || 'Suppression impossible.' });
  }

  return res.json({ success: true });
}

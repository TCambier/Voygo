import { getSupabaseForUser } from '../services/supabase.js';

export async function listTrips(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const { data, error } = await client
    .from('trips')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(400).json({ error: error.message || 'Impossible de charger les voyages.' });
  }

  return res.json({ data: data || [] });
}

export async function getTrip(req, res) {
  const { id } = req.params;
  const client = getSupabaseForUser(req.accessToken);
  const { data, error } = await client
    .from('trips')
    .select('*')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .single();

  if (error) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  return res.json({ data });
}

export async function createTrip(req, res) {
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);

  const insertPayload = {
    ...payload,
    user_id: req.user.id
  };

  const { data, error } = await client.from('trips').insert(insertPayload).select('*').single();
  if (error) {
    return res.status(400).json({ error: error.message || 'Creation impossible.' });
  }

  return res.status(201).json({ data });
}

async function deleteTripPlanningData(client, tripId, userId) {
  const relatedTables = [
    { table: 'transports', column: 'trip_id' },
    { table: 'accommodations', column: 'trip_id' },
    { table: 'logements', column: 'trip_id' },
    { table: 'activities', column: 'trip_id' },
    { table: 'activites', column: 'trip_id' }
  ];

  for (const { table, column } of relatedTables) {
    const { data: rows, error: selectError } = await client
      .from(table)
      .select('id')
      .eq(column, tripId)
      .eq('user_id', userId);

    if (selectError) {
      if (isMissingTableError(selectError)) continue;
      throw selectError;
    }

    for (const row of rows || []) {
      const { data: deletedRows, error: deleteError } = await client
        .from(table)
        .delete()
        .eq('id', row.id)
        .eq('user_id', userId)
        .select('id');

      if (deleteError) {
        if (isMissingTableError(deleteError)) break;
        throw deleteError;
      }

      if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
        throw new Error(`Suppression impossible (${table}#${row.id}).`);
      }
    }
  }
}

function normalizeDestination(value) {
  return String(value || '').trim().toLowerCase();
}

export async function updateTrip(req, res) {
  const { id } = req.params;
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);

  const { data: existingTrip, error: existingError } = await client
    .from('trips')
    .select('*')
    .eq('id', id)
    .eq('user_id', req.user.id)
    .single();

  if (existingError || !existingTrip) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  const nextDestination = Object.prototype.hasOwnProperty.call(payload, 'destination')
    ? payload.destination
    : existingTrip.destination;
  const destinationChanged = normalizeDestination(nextDestination) !== normalizeDestination(existingTrip.destination);

  const { data, error } = await client
    .from('trips')
    .update(payload)
    .eq('id', id)
    .eq('user_id', req.user.id)
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  if (destinationChanged) {
    try {
      await deleteTripPlanningData(client, id, req.user.id);
    } catch (deleteError) {
      return res.status(400).json({
        error: deleteError.message || 'Le voyage a ete mis a jour mais la suppression du planning associe a echoue.'
      });
    }
  }

  return res.json({ data, clearedPlannedItems: destinationChanged });
}

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

export async function deleteTrip(req, res) {
  const { id } = req.params;
  const client = getSupabaseForUser(req.accessToken);

  try {
    await deleteTripPlanningData(client, id, req.user.id);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Suppression du planning lie impossible.' });
  }

  const extraTables = [
    { table: 'budgets', column: 'trip_id' },
    { table: 'calendar_entries', column: 'trip_id' },
    { table: 'markers', column: 'trip_id' }
  ];

  for (const { table, column } of extraTables) {
    const { error } = await client
      .from(table)
      .delete()
      .eq(column, id)
      .eq('user_id', req.user.id);

    if (error && !isMissingTableError(error)) {
      return res.status(400).json({ error: error.message || `Suppression impossible (${table}).` });
    }
  }

  const { error: tripError } = await client
    .from('trips')
    .delete()
    .eq('id', id)
    .eq('user_id', req.user.id);

  if (tripError) {
    return res.status(400).json({ error: tripError.message || 'Suppression impossible.' });
  }

  return res.json({ success: true });
}

/**
 * @voygo-doc
 * Module: tripController
 * Fichier: server\controllers\tripController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { getSupabaseForUser, supabaseAdmin } from '../services/supabase.js';
import { getAccessDbClient, getTripAccess, isMissingTableError, isTripPastEndDate } from '../utils/tripAccess.js';

// Normalise les donnees pour 'normalizeEmail'.
function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// Normalise les donnees pour 'normalizePermission'.
function normalizePermission(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'edit' ? 'edit' : 'read';
}

// Gere la logique principale de 'requireOwnedTrip'.
async function requireOwnedTrip(db, tripId, ownerUserId) {
  const { data: trip, error } = await db
    .from('trips')
    .select('id,user_id')
    .eq('id', tripId)
    .single();

  if (error || !trip) {
    return { error: { status: 404, message: 'Voyage introuvable.' } };
  }

  if (String(trip.user_id) !== String(ownerUserId)) {
    return { error: { status: 403, message: 'Seul le proprietaire peut gerer les partages de ce voyage.' } };
  }

  return { trip };
}

// Gere la logique principale de 'findUserByEmail'.
async function findUserByEmail(email) {
  if (!supabaseAdmin) {
    return null;
  }

  const targetEmail = normalizeEmail(email);
  const perPage = 200;
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message || 'Impossible de verifier ce compte.');
    }

    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user?.email) === targetEmail);
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  return null;
}

// Liste les elements retournes par 'listTrips'.
export async function listTrips(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  const { data: ownedTrips, error } = await db
    .from('trips')
    .select('*')
    .eq('user_id', req.user.id);

  if (error) {
    return res.status(400).json({ error: error.message || 'Impossible de charger les voyages.' });
  }

  let sharedTrips = [];
  const { data: shares, error: shareError } = await db
    .from('trip_shares')
    .select('trip_id,permission')
    .eq('shared_with_user_id', req.user.id);

  if (shareError && !isMissingTableError(shareError) && supabaseAdmin) {
    return res.status(400).json({ error: shareError.message || 'Impossible de charger les voyages partages.' });
  }

  const sharedTripIds = (shares || []).map((share) => share.trip_id).filter(Boolean);
  if (sharedTripIds.length > 0) {
    const { data: fetchedSharedTrips, error: sharedTripsError } = await db
      .from('trips')
      .select('*')
      .in('id', sharedTripIds);

    if (sharedTripsError) {
      return res.status(400).json({ error: sharedTripsError.message || 'Impossible de charger les voyages partages.' });
    }

    const permissionByTripId = new Map(
      (shares || []).map((share) => [String(share.trip_id), normalizePermission(share.permission)])
    );

    sharedTrips = (fetchedSharedTrips || []).map((trip) => {
      const permission = permissionByTripId.get(String(trip.id)) || 'read';
      return {
        ...trip,
        access_mode: permission,
        can_edit: permission === 'edit' && !isTripPastEndDate(trip),
        is_shared: true
      };
    });
  }

  const ownTrips = (ownedTrips || []).map((trip) => ({
    ...trip,
    access_mode: 'owner',
    can_edit: !isTripPastEndDate(trip),
    is_shared: false
  }));

  return res.json({ data: [...ownTrips, ...sharedTrips] });
}

// Retourne l'information calculee par 'getTrip'.
export async function getTrip(req, res) {
  const { id } = req.params;
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  let access;
  try {
    access = await getTripAccess(db, id, req.user.id);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
  }

  if (!access) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  return res.json({
    data: {
      ...access.trip,
      access_mode: access.isOwner ? 'owner' : access.permission,
      can_edit: access.canEdit,
      is_shared: !access.isOwner
    }
  });
}

// Cree les donnees gerees par 'createTrip'.
export async function createTrip(req, res) {
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);

  const insertPayload = {
    ...payload,
    creation_date: payload.creation_date || new Date().toISOString(),
    user_id: req.user.id
  };

  const { data, error } = await client.from('trips').insert(insertPayload).select('*').single();
  if (error) {
    return res.status(400).json({ error: error.message || 'Creation impossible.' });
  }

  return res.status(201).json({ data });
}

// Supprime les donnees ciblees par 'deleteTripPlanningData'.
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

// Normalise les donnees pour 'normalizeDestination'.
function normalizeDestination(value) {
  return String(value || '').trim().toLowerCase();
}

// Applique les mises a jour de 'updateTrip'.
export async function updateTrip(req, res) {
  const { id } = req.params;
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  let access;
  try {
    access = await getTripAccess(db, id, req.user.id);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
  }

  if (!access) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  if (isTripPastEndDate(access.trip)) {
    return res.status(403).json({ error: 'Ce voyage est termine et ne peut plus etre modifie.' });
  }

  if (!access.canEdit) {
    return res.status(403).json({ error: 'Ce voyage est en lecture seule.' });
  }

  if (!access.isOwner && Object.prototype.hasOwnProperty.call(payload, 'destination')) {
    return res.status(403).json({ error: 'Seul le proprietaire peut modifier la destination.' });
  }

  const existingTrip = access.trip;

  const nextDestination = Object.prototype.hasOwnProperty.call(payload, 'destination')
    ? payload.destination
    : existingTrip.destination;
  const destinationChanged = normalizeDestination(nextDestination) !== normalizeDestination(existingTrip.destination);

  const { data, error } = await db
    .from('trips')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  if (destinationChanged && access.isOwner) {
    try {
      await deleteTripPlanningData(client, id, req.user.id);
    } catch (deleteError) {
      return res.status(400).json({
        error: deleteError.message || 'Le voyage a ete mis a jour mais la suppression du planning associe a echoue.'
      });
    }
  }

  return res.json({ data, clearedPlannedItems: destinationChanged && access.isOwner });
}

// Supprime les donnees ciblees par 'deleteTrip'.
export async function deleteTrip(req, res) {
  const { id } = req.params;
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  let access;
  try {
    access = await getTripAccess(db, id, req.user.id);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
  }

  if (!access) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  if (!access.isOwner) {
    return res.status(403).json({ error: 'Seul le proprietaire peut supprimer ce voyage.' });
  }

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

// Gere la logique principale de 'shareTrip'.
export async function shareTrip(req, res) {
  const { id } = req.params;
  const email = normalizeEmail(req.body?.email);
  const permission = normalizePermission(req.body?.permission);
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  if (!email) {
    return res.status(400).json({ error: 'Email requis.' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({
      error: 'Le partage de voyage requiert SUPABASE_SERVICE_ROLE_KEY sur le serveur.'
    });
  }

  const ownership = await requireOwnedTrip(db, id, req.user.id);
  if (ownership.error) {
    return res.status(ownership.error.status).json({ error: ownership.error.message });
  }

  let targetUser;
  try {
    targetUser = await findUserByEmail(email);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Verification du compte impossible.' });
  }

  if (!targetUser) {
    return res.status(404).json({ error: "Ce compte n'existe pas." });
  }

  if (String(targetUser.id) === String(req.user.id)) {
    return res.status(400).json({ error: 'Vous ne pouvez pas partager ce voyage avec votre propre compte.' });
  }

  const payload = {
    trip_id: id,
    owner_user_id: req.user.id,
    shared_with_user_id: targetUser.id,
    shared_with_email: email,
    permission
  };

  const { data, error } = await db
    .from('trip_shares')
    .upsert(payload, { onConflict: 'trip_id,shared_with_user_id' })
    .select('trip_id,shared_with_email,shared_with_user_id,permission,created_at')
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      return res.status(500).json({
        error: "La table de partage est absente. Executez le script Docs/sql/trip_shares.sql puis reessayez."
      });
    }
    return res.status(400).json({ error: error.message || 'Partage impossible.' });
  }

  return res.json({ data });
}

// Liste les elements retournes par 'listTripShares'.
export async function listTripShares(req, res) {
  const { id } = req.params;
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  const ownership = await requireOwnedTrip(db, id, req.user.id);
  if (ownership.error) {
    return res.status(ownership.error.status).json({ error: ownership.error.message });
  }

  const { data, error } = await db
    .from('trip_shares')
    .select('shared_with_user_id,shared_with_email,permission,created_at,updated_at')
    .eq('trip_id', id)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingTableError(error)) {
      return res.status(500).json({
        error: "La table de partage est absente. Executez le script Docs/sql/trip_shares.sql puis reessayez."
      });
    }
    return res.status(400).json({ error: error.message || 'Impossible de charger les partages.' });
  }

  return res.json({ data: data || [] });
}

// Applique les mises a jour de 'updateTripShare'.
export async function updateTripShare(req, res) {
  const { id, sharedWithUserId } = req.params;
  const permission = normalizePermission(req.body?.permission);
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  const ownership = await requireOwnedTrip(db, id, req.user.id);
  if (ownership.error) {
    return res.status(ownership.error.status).json({ error: ownership.error.message });
  }

  const { data, error } = await db
    .from('trip_shares')
    .update({ permission })
    .eq('trip_id', id)
    .eq('shared_with_user_id', sharedWithUserId)
    .select('shared_with_user_id,shared_with_email,permission,created_at,updated_at')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour du partage impossible.' });
  }

  return res.json({ data });
}

// Supprime les donnees ciblees par 'deleteTripShare'.
export async function deleteTripShare(req, res) {
  const { id, sharedWithUserId } = req.params;
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  const ownership = await requireOwnedTrip(db, id, req.user.id);
  if (ownership.error) {
    return res.status(ownership.error.status).json({ error: ownership.error.message });
  }

  const { error } = await db
    .from('trip_shares')
    .delete()
    .eq('trip_id', id)
    .eq('shared_with_user_id', sharedWithUserId);

  if (error) {
    return res.status(400).json({ error: error.message || 'Suppression du partage impossible.' });
  }

  return res.json({ success: true });
}

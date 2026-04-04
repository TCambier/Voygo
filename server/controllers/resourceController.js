/**
 * @voygo-doc
 * Module: resourceController
 * Fichier: server\controllers\resourceController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { getSupabaseForUser } from '../services/supabase.js';
import { getAccessDbClient, getTripAccess } from '../utils/tripAccess.js';
import { logTripChange, normalizeEmail, resolveActorLabel, resolveChangedFields } from '../utils/tripHistory.js';

function resolveResourceKind(resourceTable) {
  const map = {
    accommodations: 'accommodation',
    activities: 'activity',
    budgets: 'budget',
    notes: 'note'
  };

  return map[resourceTable] || 'resource';
}

function resolveTripIdFromPayload(payload) {
  const raw = payload?.trip_id ?? payload?.tripId ?? null;
  const normalized = String(raw || '').trim();
  return normalized || '';
}

function resolveResourceLabel(resourceKind, row) {
  if (resourceKind === 'budget') {
    const amount = row?.actual_amount ?? row?.amount ?? row?.planned_amount;
    return amount ? `Budget ${amount}` : 'Budget';
  }

  if (resourceKind === 'note') {
    const text = String(row?.title || row?.note || row?.content || '').trim();
    return text ? `Note: ${text}`.slice(0, 200) : 'Note';
  }

  if (resourceKind === 'accommodation') {
    const label = String(row?.name || row?.title || row?.address || '').trim();
    return label ? label.slice(0, 200) : 'Logement';
  }

  if (resourceKind === 'activity') {
    const label = String(row?.name || row?.title || '').trim();
    return label ? label.slice(0, 200) : 'Activite';
  }

  return 'Element';
}

// Liste les elements retournes par 'listResource'.
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

// Cree les donnees gerees par 'createResource'.
export async function createResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);
  const payload = req.body || {};

  let insertPayload = { ...payload, user_id: req.user.id };
  let access = null;

  const requestedTripId = resolveTripIdFromPayload(payload);

  if (requestedTripId) {
    try {
      access = await getTripAccess(db, requestedTripId, req.user.id);
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

  const tripIdForHistory = String(data?.trip_id || requestedTripId || '').trim();

  if (tripIdForHistory) {
    const resourceKind = resolveResourceKind(req.resourceTable);
    await logTripChange(db, {
      trip_id: tripIdForHistory,
      actor_user_id: req.user.id,
      actor_email: normalizeEmail(req.user.email),
      action: `${resourceKind}_created`,
      target_type: resourceKind,
      target_id: String(data.id),
      target_label: resolveResourceLabel(resourceKind, data),
      details: {
        actor_label: resolveActorLabel(req.user),
        edited_as: access?.isOwner ? 'owner' : 'shared_editor'
      }
    });
  }

  return res.status(201).json({ data });
}

// Applique les mises a jour de 'updateResource'.
export async function updateResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);
  const payload = req.body || {};

  const { data: existing, error: existingError } = await db
    .from(req.resourceTable)
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (existingError || !existing) {
    return res.status(404).json({ error: 'Element introuvable.' });
  }

  let access = null;
  const existingTripId = String(existing?.trip_id || existing?.tripId || '').trim();

  if (existingTripId) {
    try {
      access = await getTripAccess(db, existingTripId, req.user.id);
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

  const changedFields = resolveChangedFields(existing, payload);

  const { data, error } = await db
    .from(req.resourceTable)
    .update(payload)
    .eq('id', req.params.id)
    .select('*')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  if (existingTripId) {
    const resourceKind = resolveResourceKind(req.resourceTable);
    await logTripChange(db, {
      trip_id: existingTripId,
      actor_user_id: req.user.id,
      actor_email: normalizeEmail(req.user.email),
      action: `${resourceKind}_updated`,
      target_type: resourceKind,
      target_id: String(data.id),
      target_label: resolveResourceLabel(resourceKind, data),
      details: {
        actor_label: resolveActorLabel(req.user),
        changed_fields: changedFields,
        edited_as: access?.isOwner ? 'owner' : 'shared_editor'
      }
    });
  }

  return res.json({ data });
}

// Supprime les donnees ciblees par 'deleteResource'.
export async function deleteResource(req, res) {
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  const { data: existing, error: existingError } = await db
    .from(req.resourceTable)
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (existingError || !existing) {
    return res.status(404).json({ error: 'Element introuvable.' });
  }

  let access = null;
  const existingTripId = String(existing?.trip_id || existing?.tripId || '').trim();

  if (existingTripId) {
    try {
      access = await getTripAccess(db, existingTripId, req.user.id);
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

  if (existingTripId) {
    const resourceKind = resolveResourceKind(req.resourceTable);
    await logTripChange(db, {
      trip_id: existingTripId,
      actor_user_id: req.user.id,
      actor_email: normalizeEmail(req.user.email),
      action: `${resourceKind}_deleted`,
      target_type: resourceKind,
      target_id: String(existing.id),
      target_label: resolveResourceLabel(resourceKind, existing),
      details: {
        actor_label: resolveActorLabel(req.user),
        edited_as: access?.isOwner ? 'owner' : 'shared_editor'
      }
    });
  }

  return res.json({ success: true });
}

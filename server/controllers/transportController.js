/**
 * @voygo-doc
 * Module: transportController
 * Fichier: server\controllers\transportController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { getSupabaseForUser } from '../services/supabase.js';
import { getAccessDbClient, getTripAccess } from '../utils/tripAccess.js';
import { logTripChange, normalizeEmail, resolveActorLabel, resolveChangedFields } from '../utils/tripHistory.js';
import { touchTripModificationDate } from '../utils/tripModification.js';

// Normalise les donnees pour 'normalizeDate'.
function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.includes('T') ? raw.split('T')[0] : raw;
}

// Gere la logique principale de 'toMinuteOfDay'.
function toMinuteOfDay(timeValue) {
  const raw = String(timeValue || '').trim();
  const match = raw.match(/(\d{2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

// Normalise les donnees pour 'normalizeTransportTime'.
function normalizeTransportTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/(\d{2}:\d{2})(?::\d{2})?/);
  if (match) return `${match[1]}:00`;
  return raw;
}

// Gere la logique principale de 'readScheduleMetadata'.
function readScheduleMetadata(description) {
  const text = String(description || '');
  const match = text.match(/\[VOYGO_SCHEDULE\]([\s\S]*?)\[\/VOYGO_SCHEDULE\]/);
  if (!match || !match[1]) return null;

  try {
    const parsed = JSON.parse(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Gere la logique principale de 'extractActivitySchedule'.
function extractActivitySchedule(activity) {
  const metadata = readScheduleMetadata(activity?.description);
  const date = normalizeDate(metadata?.date || activity?.activity_date || '');
  const startTime = String(metadata?.time || '').trim();
  const durationRaw = Number(metadata?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 60;

  if (!date || !startTime || toMinuteOfDay(startTime) === null) return null;

  return { date, startTime, durationMinutes };
}

// Gere la logique principale de 'extractTransportSchedule'.
function extractTransportSchedule(transport) {
  const date = normalizeDate(transport?.travel_date || '');
  const startTime = String(transport?.travel_time || '').trim();
  const durationRaw = Number(transport?.duration_minutes);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.round(durationRaw)
    : 0;

  if (!date || !startTime || toMinuteOfDay(startTime) === null || durationMinutes <= 0) return null;

  return { date, startTime, durationMinutes };
}

// Gere la logique principale de 'schedulesOverlap'.
function schedulesOverlap(leftSchedule, rightSchedule) {
  if (!leftSchedule || !rightSchedule || leftSchedule.date !== rightSchedule.date) return false;
  const leftStart = toMinuteOfDay(leftSchedule.startTime);
  const rightStart = toMinuteOfDay(rightSchedule.startTime);
  if (leftStart === null || rightStart === null) return false;
  const leftEnd = leftStart + leftSchedule.durationMinutes;
  const rightEnd = rightStart + rightSchedule.durationMinutes;
  return leftStart < rightEnd && rightStart < leftEnd;
}

// Gere la logique principale de 'findConflictingActivity'.
function findConflictingActivity(activities, transportSchedule) {
  return (activities || []).find((activity) => schedulesOverlap(extractActivitySchedule(activity), transportSchedule)) || null;
}

// Gere la logique principale de 'findConflictingTransport'.
function findConflictingTransport(transports, transportSchedule, excludedTransportId = null) {
  return (transports || []).find((transport) => {
    if (excludedTransportId && String(transport.id) === String(excludedTransportId)) return false;
    return schedulesOverlap(extractTransportSchedule(transport), transportSchedule);
  }) || null;
}

// Liste les elements retournes par 'listTransports'.
export async function listTransports(req, res) {
  const { tripId } = req.params;
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  let access;
  try {
    access = await getTripAccess(db, tripId, req.user.id);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
  }

  if (!access) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  const { data, error } = await db
    .from('transports')
    .select('id,origin,destination,travel_date,travel_time,mode,price,duration_minutes,created_at,trip_id')
    .eq('trip_id', tripId)
    .order('travel_date', { ascending: true })
    .order('travel_time', { ascending: true });

  if (error) {
    return res.status(400).json({ error: error.message || 'Chargement impossible.' });
  }

  return res.json({ data: data || [] });
}

// Cree les donnees gerees par 'createTransport'.
export async function createTransport(req, res) {
  const { tripId } = req.params;
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  let access;
  try {
    access = await getTripAccess(db, tripId, req.user.id);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
  }

  if (!access) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  if (!access.canEdit) {
    return res.status(403).json({ error: 'Ce voyage est en lecture seule.' });
  }

  const insertPayload = {
    ...payload,
    travel_time: normalizeTransportTime(payload.travel_time),
    trip_id: tripId,
    user_id: access.trip.user_id
  };

  const nextSchedule = extractTransportSchedule(insertPayload);
  if (!nextSchedule) {
    return res.status(400).json({ error: 'Jour, heure et duree du transport requis.' });
  }

  const [activitiesResult, transportsResult] = await Promise.all([
    db
      .from('activities')
      .select('id,activity_date,description,name')
      .eq('trip_id', tripId)
      ,
    db
      .from('transports')
      .select('id,origin,destination,travel_date,travel_time,duration_minutes')
      .eq('trip_id', tripId)
  ]);

  if (activitiesResult.error || transportsResult.error) {
    return res.status(400).json({ error: activitiesResult.error?.message || transportsResult.error?.message || 'Verification de conflit impossible.' });
  }

  const conflictingActivity = findConflictingActivity(activitiesResult.data, nextSchedule);
  if (conflictingActivity) {
    return res.status(409).json({ error: `Une activite est deja prevue pendant ce transport: ${conflictingActivity.name || 'activite'}.` });
  }

  const conflictingTransport = findConflictingTransport(transportsResult.data, nextSchedule);
  if (conflictingTransport) {
    return res.status(409).json({ error: 'Un autre transport est deja prevu sur ce creneau.' });
  }

  const { data, error } = await db
    .from('transports')
    .insert(insertPayload)
    .select('id,origin,destination,travel_date,travel_time,mode,price,duration_minutes,created_at,trip_id')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Creation impossible.' });
  }

  await touchTripModificationDate(db, tripId);

  await logTripChange(db, {
    trip_id: tripId,
    actor_user_id: req.user.id,
    actor_email: normalizeEmail(req.user.email),
    action: 'transport_created',
    target_type: 'transport',
    target_id: String(data.id),
    target_label: String(`${data.origin || '?'} -> ${data.destination || '?'}`).slice(0, 200),
    details: {
      actor_label: resolveActorLabel(req.user),
      edited_as: access.isOwner ? 'owner' : 'shared_editor'
    }
  });

  return res.status(201).json({ data });
}

// Applique les mises a jour de 'updateTransport'.
export async function updateTransport(req, res) {
  const { id } = req.params;
  const payload = req.body || {};
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  const { data: currentTransport, error: currentError } = await db
    .from('transports')
    .select('*')
    .eq('id', id)
    .single();

  if (currentError || !currentTransport) {
    return res.status(404).json({ error: 'Transport introuvable.' });
  }

  let access;
  try {
    access = await getTripAccess(db, currentTransport.trip_id, req.user.id);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Verification des droits impossible.' });
  }

  if (!access) {
    return res.status(404).json({ error: 'Voyage introuvable.' });
  }

  if (!access.canEdit) {
    return res.status(403).json({ error: 'Ce voyage est en lecture seule.' });
  }

  const changedFields = resolveChangedFields(currentTransport, payload);

  const nextTransport = { ...currentTransport, ...payload };
  nextTransport.travel_time = normalizeTransportTime(nextTransport.travel_time);
  payload.travel_time = payload.travel_time === undefined ? undefined : normalizeTransportTime(payload.travel_time);
  const mustValidateSchedule = [payload.travel_date, payload.travel_time, payload.duration_minutes].some((value) => value !== undefined);
  const nextSchedule = extractTransportSchedule(nextTransport);

  if (mustValidateSchedule && !nextSchedule) {
    return res.status(400).json({ error: 'Jour, heure et duree du transport requis.' });
  }

  if (nextSchedule) {
    const [activitiesResult, transportsResult] = await Promise.all([
      db
        .from('activities')
        .select('id,activity_date,description,name')
        .eq('trip_id', currentTransport.trip_id),
      db
        .from('transports')
        .select('id,origin,destination,travel_date,travel_time,duration_minutes')
        .eq('trip_id', currentTransport.trip_id)
    ]);

    if (activitiesResult.error || transportsResult.error) {
      return res.status(400).json({ error: activitiesResult.error?.message || transportsResult.error?.message || 'Verification de conflit impossible.' });
    }

    const conflictingActivity = findConflictingActivity(activitiesResult.data, nextSchedule);
    if (conflictingActivity) {
      return res.status(409).json({ error: `Une activite est deja prevue pendant ce transport: ${conflictingActivity.name || 'activite'}.` });
    }

    const conflictingTransport = findConflictingTransport(transportsResult.data, nextSchedule, id);
    if (conflictingTransport) {
      return res.status(409).json({ error: 'Un autre transport est deja prevu sur ce creneau.' });
    }
  }

  const { data, error } = await db
    .from('transports')
    .update(payload)
    .eq('id', id)
    .select('id,origin,destination,travel_date,travel_time,mode,price,duration_minutes,created_at,trip_id')
    .single();

  if (error) {
    return res.status(400).json({ error: error.message || 'Mise a jour impossible.' });
  }

  await touchTripModificationDate(db, currentTransport.trip_id);

  await logTripChange(db, {
    trip_id: currentTransport.trip_id,
    actor_user_id: req.user.id,
    actor_email: normalizeEmail(req.user.email),
    action: 'transport_updated',
    target_type: 'transport',
    target_id: String(data.id),
    target_label: String(`${data.origin || '?'} -> ${data.destination || '?'}`).slice(0, 200),
    details: {
      actor_label: resolveActorLabel(req.user),
      changed_fields: changedFields,
      edited_as: access.isOwner ? 'owner' : 'shared_editor'
    }
  });

  return res.json({ data });
}

// Supprime les donnees ciblees par 'deleteTransport'.
export async function deleteTransport(req, res) {
  const { id } = req.params;
  const client = getSupabaseForUser(req.accessToken);
  const db = getAccessDbClient(client);

  const { data: existing, error: existingError } = await db
    .from('transports')
    .select('id,trip_id')
    .eq('id', id)
    .single();

  if (existingError || !existing) {
    return res.status(404).json({ error: 'Transport introuvable.' });
  }

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

  const { error } = await db
    .from('transports')
    .delete()
    .eq('id', id);

  if (error) {
    return res.status(400).json({ error: error.message || 'Suppression impossible.' });
  }

  await touchTripModificationDate(db, existing.trip_id);

  await logTripChange(db, {
    trip_id: existing.trip_id,
    actor_user_id: req.user.id,
    actor_email: normalizeEmail(req.user.email),
    action: 'transport_deleted',
    target_type: 'transport',
    target_id: String(existing.id),
    target_label: 'Transport',
    details: {
      actor_label: resolveActorLabel(req.user),
      edited_as: access.isOwner ? 'owner' : 'shared_editor'
    }
  });

  return res.json({ success: true });
}

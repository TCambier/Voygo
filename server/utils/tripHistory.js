/**
 * @voygo-doc
 * Module: tripHistory
 * Fichier: server\utils\tripHistory.js
 * Role: Utilitaires de journalisation de l'historique des changements de voyage.
 */
import { isMissingTableError } from './tripAccess.js';

const tripHistoryErrors = new Map();

// Normalise les donnees pour les emails stockes dans l'historique.
export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// Construit un libelle lisible pour l'acteur qui realise une action.
export function resolveActorLabel(user) {
  const fullName = [user?.user_metadata?.first_name, user?.user_metadata?.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName) {
    return fullName;
  }

  const fallback = String(user?.email || '').trim();
  return fallback || 'Utilisateur inconnu';
}

// Retourne la liste des champs effectivement modifies pour un payload partiel.
export function resolveChangedFields(existingRow, payload) {
  const source = existingRow || {};
  const patch = payload || {};
  return Object.keys(patch).filter((key) => source?.[key] !== patch?.[key]);
}

function setTripHistoryError(tripId, message) {
  const key = String(tripId || '').trim();
  if (!key) return;

  if (!message) {
    tripHistoryErrors.delete(key);
    return;
  }

  tripHistoryErrors.set(key, {
    message: String(message || '').trim(),
    at: new Date().toISOString()
  });
}

export function getTripHistoryError(tripId) {
  const key = String(tripId || '').trim();
  if (!key) return null;
  return tripHistoryErrors.get(key) || null;
}

// Journalise un changement de voyage sans bloquer le flux principal.
export async function logTripChange(db, payload) {
  const normalizedTripId = String(payload?.trip_id || '').trim();
  const normalizedPayload = {
    ...payload,
    trip_id: normalizedTripId
  };

  const { error } = await db.from('trip_change_history').insert(normalizedPayload);
  if (!error) {
    setTripHistoryError(normalizedTripId, '');
    return;
  }

  if (isMissingTableError(error)) {
    setTripHistoryError(normalizedTripId, 'Table trip_change_history absente.');
    return;
  }

  const firstMessage = error.message || String(error);

  // Fallback: some RLS setups can reject actor_user_id checks.
  const fallbackPayload = {
    ...normalizedPayload,
    actor_user_id: null
  };

  const { error: fallbackError } = await db.from('trip_change_history').insert(fallbackPayload);
  if (!fallbackError) {
    setTripHistoryError(normalizedTripId, '');
    return;
  }

  const finalMessage = `${firstMessage} | fallback: ${fallbackError.message || fallbackError}`;
  setTripHistoryError(normalizedTripId, finalMessage);

  console.warn('[trip_change_history] insert failed:', finalMessage);
}

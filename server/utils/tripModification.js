/**
 * @voygo-doc
 * Module: tripModification
 * Fichier: server\utils\tripModification.js
 * Role: Utilitaire de mise a jour de la date de modification d'un voyage.
 */

function nowIsoDate() {
  return new Date().toISOString();
}

export async function touchTripModificationDate(db, tripId) {
  const normalizedTripId = String(tripId || '').trim();
  if (!normalizedTripId) return;

  await db
    .from('trips')
    .update({ modification_date: nowIsoDate() })
    .eq('id', normalizedTripId);
}

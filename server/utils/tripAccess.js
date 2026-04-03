/**
 * @voygo-doc
 * Module: tripAccess
 * Fichier: server\utils\tripAccess.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { supabaseAdmin } from '../services/supabase.js';

// Normalise les permissions de partage en valeurs supportees par l'application.
function normalizePermission(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'edit' ? 'edit' : 'read';
}

// Normalise une date pour les comparaisons cote serveur.
function toDateKey(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

// Indique si le voyage est passe et donc verrouille en modification.
export function isTripPastEndDate(trip, referenceDate = new Date()) {
  const endDate = toDateKey(trip?.end_date || trip?.endDate || trip?.return_date || trip?.returnDate || '');
  if (!endDate) return false;

  const today = toDateKey(referenceDate);
  if (!today) return false;

  return endDate < today;
}

// Detecte les erreurs SQL/PostgREST liees a une table absente.
export function isMissingTableError(error) {
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

// Utilise le client admin quand il existe pour contourner les limites RLS cote serveur.
export function getAccessDbClient(userClient) {
  return supabaseAdmin || userClient;
}

// Calcule les droits d'un utilisateur sur un voyage: owner, partage edit, partage read, ou aucun acces.
export async function getTripAccess(db, tripId, userId) {
  const { data: trip, error: tripError } = await db
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (tripError || !trip) {
    return null;
  }

  if (String(trip.user_id) === String(userId)) {
    return {
      trip,
      isOwner: true,
      permission: 'edit',
      canEdit: !isTripPastEndDate(trip)
    };
  }

  const { data: share, error: shareError } = await db
    .from('trip_shares')
    .select('permission')
    .eq('trip_id', tripId)
    .eq('shared_with_user_id', userId)
    .maybeSingle();

  if (shareError) {
    if (isMissingTableError(shareError)) return null;
    throw new Error(shareError.message || 'Verification des droits impossible.');
  }

  if (!share) return null;

  const permission = normalizePermission(share.permission);
  return {
    trip,
    isOwner: false,
    permission,
    canEdit: permission === 'edit' && !isTripPastEndDate(trip)
  };
}

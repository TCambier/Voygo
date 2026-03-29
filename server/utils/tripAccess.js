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
      canEdit: true
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
    canEdit: permission === 'edit'
  };
}

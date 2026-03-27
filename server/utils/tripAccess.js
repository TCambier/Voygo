import { supabaseAdmin } from '../services/supabase.js';

function normalizePermission(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'edit' ? 'edit' : 'read';
}

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

export function getAccessDbClient(userClient) {
  return supabaseAdmin || userClient;
}

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

// auth-guard.js - Protects pages that require authentication
import { supabase } from '../assets/js/supabase.js';

export async function requireAuth() {
  const returnTo = `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}`;

  try {
    const { data, error } = await supabase.auth.getUser();
    const userId = data?.user?.id;
    if (error || !userId) {
      window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
      return null;
    }
    return data.user;
  } catch (error) {
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
    return null;
  }
}

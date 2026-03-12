// auth-guard.js - Protects pages that require authentication
import { api } from '../assets/js/api.js';

export async function requireAuth() {
  const returnTo = `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}`;

  try {
    const data = await api.get('/api/auth/me');
    const userId = data?.user?.id;
    if (!userId) {
      window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
      return null;
    }
    return data.user;
  } catch (error) {
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
    return null;
  }
}

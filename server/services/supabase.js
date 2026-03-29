/**
 * @voygo-doc
 * Module: supabase
 * Fichier: server\services\supabase.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.warn('SUPABASE_URL or SUPABASE_ANON_KEY is missing. API calls will fail until configured.');
}

if (!config.supabaseServiceRoleKey) {
  console.warn(
    'SUPABASE_SERVICE_ROLE_KEY is missing. Account deletion from Supabase Auth will require the delete-account Edge Function fallback.'
  );
}

export const supabaseAuth = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export const supabaseAdmin = config.supabaseServiceRoleKey
  ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  : null;

console.log(`Supabase admin mode: ${supabaseAdmin ? 'enabled' : 'disabled'}`);

// Retourne l'information calculee par 'getSupabaseForUser'.
export function getSupabaseForUser(accessToken) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    }
  });
}

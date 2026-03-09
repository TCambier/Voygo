// supabase.js
// This file exports a configured Supabase client. Replace the placeholder
// values below with the credentials for your own Supabase project.
// The README also explains where to put these values.

// When using ES modules in the browser you'll need to import this file with
// `import { supabase } from './supabase.js';` (adjust the path as needed).
// Alternatively you can load the library via CDN and attach `supabase` to
// window if you prefer a non‑module approach.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// TODO: change these values before running the app
export const SUPABASE_URL = 'https://whvkycnafrcovdxxsjnm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indodmt5Y25hZnJjb3ZkeHhzam5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODk0MDgsImV4cCI6MjA4ODM2NTQwOH0.mlKJSu0oQky_0Q0IxkUUiW3nSAQx76bN9Wk8E0_kD8I';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Example helper functions that controllers can reuse:
// import { supabase } from './supabase.js';
//
// export async function fetchTrips() {
//   const { data, error } = await supabase.from('trips').select('*');
//   if (error) throw error;
//   return data;
//}

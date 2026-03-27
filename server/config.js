import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root even if the server is started from ./server.
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
// Keep default dotenv behavior as a fallback.
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    '',
  openTripMapApiKey: process.env.OPENTRIPMAP_API_KEY || ''
};

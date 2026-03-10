// user.js
import { supabase } from '../assets/js/supabase.js';

export class User {
    static async create(first_name, last_name, email, password) {
        // Create account in Supabase Auth (source of JWT)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name,
                    last_name
                }
            }
        });

        if (authError) {
            const msg = authError.message || '';
            if (msg.toLowerCase().includes('already')) {
                throw new Error('Cette adresse email existe déjà');
            }
            throw authError;
        }

        // Supabase returns a user with empty identities when the email already exists
        const identities = authData?.user?.identities;
        if (Array.isArray(identities) && identities.length === 0) {
            throw new Error('Cette adresse email existe déjà');
        }

        return authData;
    }

    static async emailExists(email) {
        // Supabase Auth does not expose email existence checks for anon clients.
        // Keep API for UI validation, but defer the real check to signUp.
        return false;
    }

    static async verifyPassword(email, password) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError || !authData?.session) {
            return null;
        }

        return {
            id: authData.user.id,
            first_name: authData.user.user_metadata?.first_name || '',
            last_name: authData.user.user_metadata?.last_name || '',
            email: authData.user.email || email,
            token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            expires_at: authData.session.expires_at
        };
    }
}

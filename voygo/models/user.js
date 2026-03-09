// user.js
import { supabase } from '../assets/js/supabase.js';

// Legacy hash kept for local users table compatibility
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'voygo_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class User {
    static async create(first_name, last_name, email, password) {
        const emailExists = await this.emailExists(email);
        if (emailExists) {
            throw new Error('Cette adresse email existe deja');
        }

        // Create account in Supabase Auth (source of JWT)
        const { error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    first_name,
                    last_name
                }
            }
        });

        if (authError) throw authError;

        // Keep profile row in users table
        const hashedPassword = await hashPassword(password);
        const { data, error } = await supabase
            .from('users')
            .insert([
                {
                    first_name,
                    last_name,
                    email,
                    password: hashedPassword
                }
            ]);

        if (error) throw error;
        return data;
    }

    static async emailExists(email) {
        const { data, error } = await supabase.from('users').select('id').eq('email', email);
        if (error) throw error;
        return data && data.length > 0;
    }

    static async verifyPassword(email, password) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError || !authData?.session) {
            return null;
        }

        const { data: profile } = await supabase
            .from('users')
            .select('id, first_name, last_name, email')
            .eq('email', email)
            .maybeSingle();

        return {
            id: profile?.id || authData.user.id,
            first_name: profile?.first_name || authData.user.user_metadata?.first_name || '',
            last_name: profile?.last_name || authData.user.user_metadata?.last_name || '',
            email: authData.user.email || email,
            token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            expires_at: authData.session.expires_at
        };
    }
}

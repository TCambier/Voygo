// user.js
import { supabase } from '../assets/js/supabase.js';

// Fonction pour hasher le mot de passe avec SHA-256 et un sel
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'voygo_salt_2024'); // Sel fixe pour cet exemple
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export class User {
    static async create(first_name, last_name, email, password) {
        // Vérifier d'abord que l'email n'existe pas
        const emailExists = await this.emailExists(email);
        if (emailExists) {
            throw new Error('Cette adresse email existe déjà');
        }

        // Hasher le mot de passe avant de l'insérer
        const hashedPassword = await hashPassword(password);

        const { data, error } = await supabase
            .from('users')
            .insert([{
                first_name: first_name,
                last_name: last_name,
                email: email,
                password: hashedPassword // Mot de passe hashé
            }]);

        if (error) throw error;
        return data;
    }

    static async emailExists(email) {
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq('email', email);

        if (error) throw error;
        return data && data.length > 0;
    }

    // Nouvelle méthode pour vérifier le mot de passe lors de la connexion
    static async verifyPassword(email, password) {
        const hashedPassword = await hashPassword(password);

        const { data, error } = await supabase
            .from('users')
            .select('id, first_name, last_name, email')
            .eq('email', email)
            .eq('password', hashedPassword)
            .single();

        if (error) {
            if (error.code === 'PGRST116') { // No rows found
                return null;
            }
            throw error;
        }

        return data;
    }

    // Add other methods as needed
}
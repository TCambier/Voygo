// user.js
import { supabase } from '../assets/js/supabase.js';

export class User {
    static async create(first_name, last_name, email, password) {
        const { data, error } = await supabase
            .from('users')
            .insert([{ first_name, last_name, email, password }]);

        if (error) throw error;
        return data;
    }

    // Add other methods as needed, e.g., findByEmail, etc.
}
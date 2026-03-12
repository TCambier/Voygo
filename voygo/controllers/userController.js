import { api } from '../assets/js/api.js';

export async function signup(first_name, last_name, email, password) {
    try {
        const data = await api.post('/api/auth/signup', { first_name, last_name, email, password });
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function login(email, password) {
    try {
        const response = await api.post('/api/auth/login', { email, password });
        return { success: true, user: response?.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function checkEmailExists(email) {
    try {
        const result = await api.get(`/api/auth/email-exists?email=${encodeURIComponent(email)}`);
        return { exists: Boolean(result?.exists) };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

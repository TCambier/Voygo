/**
 * @voygo-doc
 * Module: userController
 * Fichier: voygo\controllers\userController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

// Gere la logique principale de 'signup'.
export async function signup(first_name, last_name, email, password) {
    try {
        const data = await api.post('/api/auth/signup', { first_name, last_name, email, password });
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Gere la logique principale de 'login'.
export async function login(email, password) {
    try {
        const response = await api.post('/api/auth/login', { email, password });
        return { success: true, user: response?.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Gere la logique principale de 'checkEmailExists'.
export async function checkEmailExists(email) {
    try {
        const result = await api.get(`/api/auth/email-exists?email=${encodeURIComponent(email)}`);
        return { exists: Boolean(result?.exists) };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Gere la logique principale de 'requestPasswordReset'.
export async function requestPasswordReset(email) {
    try {
        const result = await api.post('/api/auth/forgot-password', { email });
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Gere la logique principale de 'resetPassword'.
export async function resetPassword(accessToken, password) {
    try {
        const result = await api.post('/api/auth/reset-password', { accessToken, password });
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

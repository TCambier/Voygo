// userController.js
import { User } from '../models/user.js';

export async function signup(first_name, last_name, email, password) {
    try {
        const data = await User.create(first_name, last_name, email, password);
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function login(email, password) {
    try {
        const user = await User.verifyPassword(email, password);
        if (user) {
            return { success: true, user };
        } else {
            return { success: false, error: 'Email ou mot de passe incorrect' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function checkEmailExists(email) {
    try {
        const exists = await User.emailExists(email);
        return { exists };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Add other controller functions as needed
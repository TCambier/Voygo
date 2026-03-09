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

// Add other controller functions as needed
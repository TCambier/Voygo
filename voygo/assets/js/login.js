// login.js - Gestion de la connexion
import { login } from '../../controllers/userController.js';

window.addEventListener('load', () => {
    const loginForm = document.getElementById('login-form');
    const loginErrorMessage = document.getElementById('login-error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            loginErrorMessage.classList.add('show');
            loginErrorMessage.textContent = 'Veuillez remplir tous les champs';
            return;
        }

        // Cacher le message d'erreur pendant la tentative de connexion
        loginErrorMessage.classList.remove('show');

        const result = await login(email, password);
        if (result.success) {
            // Rediriger vers la page index
            window.location.href = 'index.html';
        } else {
            // Afficher le message d'erreur
            loginErrorMessage.classList.add('show');
            loginErrorMessage.textContent = result.error;
        }
    });
});
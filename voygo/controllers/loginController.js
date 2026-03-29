/**
 * @voygo-doc
 * Module: loginController
 * Fichier: voygo\controllers\loginController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
// login.js - Gestion de la connexion
import { login } from './userController.js';

window.addEventListener('load', () => {
    const loginForm = document.getElementById('login-form');
    const loginErrorMessage = document.getElementById('login-error-message');
    const params = new URLSearchParams(window.location.search);
    const requestedReturnTo = params.get('returnTo') || 'index.html';
    if (!loginForm || !loginErrorMessage) return;

    // Sanitize returnTo to avoid open redirects to arbitrary paths.
    const returnTo = /^([a-zA-Z0-9_-]+)\.html(\?.*)?$/.test(requestedReturnTo)
        ? requestedReturnTo
        : 'index.html';


    function setLoginError(message) {
        loginErrorMessage.classList.add('show');
        loginErrorMessage.textContent = message;
    }

    function clearLoginError() {
        loginErrorMessage.classList.remove('show');
        loginErrorMessage.textContent = '';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            setLoginError('Veuillez remplir tous les champs');
            return;
        }

        // Cacher le message d'erreur pendant la tentative de connexion
        clearLoginError();

        const result = await login(email, password);
        if (result.success) {
            if (result.user) {
                localStorage.setItem('voygo_auth_user', JSON.stringify(result.user));
            }
            window.location.href = returnTo;
        } else {
            // Afficher le message d'erreur
            setLoginError(result.error);
        }
    });
});

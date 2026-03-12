// login.js - Gestion de la connexion
import { login } from './userController.js';
import { api } from '../assets/js/api.js';

window.addEventListener('load', () => {
    const loginForm = document.getElementById('login-form');
    const loginErrorMessage = document.getElementById('login-error-message');
    const googleButtonContainer = document.getElementById('google-signin-btn');
    const params = new URLSearchParams(window.location.search);
    const requestedReturnTo = params.get('returnTo') || 'index.html';
    const returnTo = /^([a-zA-Z0-9_-]+)\.html(\?.*)?$/.test(requestedReturnTo)
        ? requestedReturnTo
        : 'index.html';

    const GOOGLE_CLIENT_ID =
        '1088758476764-ojnpflc7g8ag2u0epccgq563mo8gj1jj.apps.googleusercontent.com';

    function setLoginError(message) {
        loginErrorMessage.classList.add('show');
        loginErrorMessage.textContent = message;
    }

    function clearLoginError() {
        loginErrorMessage.classList.remove('show');
        loginErrorMessage.textContent = '';
    }

    function generateNonce() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async function handleGoogleCredential(response) {
        if (!response?.credential) {
            setLoginError('Connexion Google invalide');
            return;
        }

        clearLoginError();

        const nonce = sessionStorage.getItem('voygo_google_nonce') || undefined;
        try {
            await api.post('/api/auth/google', { token: response.credential, nonce });
            window.location.href = returnTo;
        } catch (error) {
            setLoginError(error?.message || 'Connexion Google echouee');
        }
    }

    function initGoogleSignIn() {
        if (!googleButtonContainer || !window.google?.accounts?.id) return false;

        const nonce = generateNonce();
        sessionStorage.setItem('voygo_google_nonce', nonce);

        window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredential,
            nonce
        });

        window.google.accounts.id.renderButton(googleButtonContainer, {
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'continue_with',
            width: 300
        });

        return true;
    }

    if (googleButtonContainer) {
        let tries = 0;
        const interval = setInterval(() => {
            tries += 1;
            if (initGoogleSignIn() || tries > 50) {
                clearInterval(interval);
            }
        }, 100);
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
            window.location.href = returnTo;
        } else {
            // Afficher le message d'erreur
            setLoginError(result.error);
        }
    });
});

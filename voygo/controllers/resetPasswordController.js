/**
 * @voygo-doc
 * Module: resetPasswordController
 * Fichier: voygo\controllers\resetPasswordController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
// Gere le formulaire de reinitialisation de mot de passe.
import { resetPassword } from './userController.js';

// Verifie la condition exposee par 'isPasswordStrong'.
function isPasswordStrong(password = '') {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    return hasUpperCase && hasLowerCase && hasNumbers && hasSymbols;
}

// Retourne l'information calculee par 'getAccessTokenFromHash'.
function getAccessTokenFromHash() {
    const hash = window.location.hash || '';
    if (hash.startsWith('#')) {
        const hashParams = new URLSearchParams(hash.slice(1));
        const tokenFromHash = hashParams.get('access_token');
        if (tokenFromHash) return tokenFromHash;
    }

    const queryParams = new URLSearchParams(window.location.search || '');
    return queryParams.get('access_token');
}

window.addEventListener('load', () => {
    const form = document.getElementById('reset-form');
    const newPassword = document.getElementById('new-password');
    const confirmPassword = document.getElementById('confirm-password');
    const errorMessage = document.getElementById('reset-error-message');
    const submitBtn = document.getElementById('reset-submit');
    const accessToken = getAccessTokenFromHash();

    if (!form || !newPassword || !confirmPassword || !errorMessage || !submitBtn) return;

    function setError(message) {
        errorMessage.classList.add('show');
        errorMessage.textContent = message;
    }

    function clearError() {
        errorMessage.classList.remove('show');
        errorMessage.textContent = '';
    }

    if (!accessToken) {
        setError('Lien invalide ou expire. Demandez un nouveau lien.');
        submitBtn.disabled = true;
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearError();

        const password = newPassword.value;
        const confirmation = confirmPassword.value;

        if (!isPasswordStrong(password)) {
            setError('Le mot de passe doit contenir au minimum une majuscule, une minuscule, un chiffre et un symbole');
            return;
        }

        if (password !== confirmation) {
            setError('Les mots de passe ne correspondent pas.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Mise a jour...';

        const result = await resetPassword(accessToken, password);
        if (result.success) {
            submitBtn.textContent = 'Mot de passe mis a jour';
            window.location.replace('login.html?reset=success');
            return;
        }

        setError(result.error || 'Impossible de mettre a jour le mot de passe.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reinitialiser';
    });
});

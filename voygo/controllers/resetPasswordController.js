import { resetPassword } from './userController.js';

function getAccessTokenFromHash() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#')) return null;
    const params = new URLSearchParams(hash.slice(1));
    return params.get('access_token');
}

window.addEventListener('load', () => {
    const form = document.getElementById('reset-form');
    const newPassword = document.getElementById('new-password');
    const confirmPassword = document.getElementById('confirm-password');
    const errorMessage = document.getElementById('reset-error-message');
    const submitBtn = document.getElementById('reset-submit');
    const accessToken = getAccessTokenFromHash();

    function setError(message) {
        errorMessage.classList.add('show');
        errorMessage.textContent = message;
    }

    function clearError() {
        errorMessage.classList.remove('show');
        errorMessage.textContent = '';
    }

    if (!accessToken) {
        setError('Lien invalide ou expirÃ©. Demandez un nouveau lien.');
        submitBtn.disabled = true;
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearError();

        const password = newPassword.value;
        const confirmation = confirmPassword.value;

        if (password.length < 8) {
            setError('Le mot de passe doit contenir au moins 8 caractÃ¨res.');
            return;
        }
        if (password !== confirmation) {
            setError('Les mots de passe ne correspondent pas.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Mise Ã  jour...';

        const result = await resetPassword(accessToken, password);
        if (result.success) {
            submitBtn.textContent = 'Mot de passe mis Ã  jour';
            window.location.replace('login.html?reset=success');
            return;
        }

        setError(result.error || 'Impossible de mettre Ã  jour le mot de passe.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'RÃ©initialiser';
    });
});

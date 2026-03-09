// login.js - Gestion de la connexion
import { login } from '../../controllers/userController.js';

window.addEventListener('load', () => {
    const loginForm = document.getElementById('login-form');
    const loginErrorMessage = document.getElementById('login-error-message');
    const params = new URLSearchParams(window.location.search);
    const requestedReturnTo = params.get('returnTo') || 'index.html';
    const returnTo = /^([a-zA-Z0-9_-]+)\.html(\?.*)?$/.test(requestedReturnTo)
        ? requestedReturnTo
        : 'index.html';

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
            if (result.user?.token) {
                localStorage.setItem('voygo_jwt', result.user.token);
                localStorage.setItem(
                    'voygo_auth_user',
                    JSON.stringify({
                        id: result.user.id,
                        email: result.user.email,
                        first_name: result.user.first_name || '',
                        last_name: result.user.last_name || ''
                    })
                );
            }
            // Rediriger vers la page demandee (ou index par defaut)
            window.location.href = returnTo;
        } else {
            // Afficher le message d'erreur
            loginErrorMessage.classList.add('show');
            loginErrorMessage.textContent = result.error;
        }
    });
});

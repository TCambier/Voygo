// signup.js - Gestion de l'inscription
import { signup, checkEmailExists } from '../../controllers/userController.js';

window.addEventListener('load', () => {
    const emailInput = document.getElementById('email');
    const emailErrorMessage = document.getElementById('email-error-message');
    const passwordInput = document.getElementById('password');
    const passwordErrorMessage = document.getElementById('password-error-message');
    const signupBtn = document.getElementById('signup-btn');
    const signupForm = document.getElementById('signup-form');

    let emailCheckTimeout;
    let passwordCheckTimeout;

    // Fonction pour valider le mot de passe
    function validatePassword(password = null) {
        const passwordToCheck = password !== null ? password : passwordInput.value;

        if (!passwordToCheck) {
            passwordInput.classList.remove('error');
            passwordErrorMessage.classList.remove('show');
            return true;
        }

        // Vérifications des critères
        const hasUpperCase = /[A-Z]/.test(passwordToCheck);
        const hasLowerCase = /[a-z]/.test(passwordToCheck);
        const hasNumbers = /\d/.test(passwordToCheck);
        const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(passwordToCheck);

        const isValid = hasUpperCase && hasLowerCase && hasNumbers && hasSymbols;

        if (!isValid) {
            passwordInput.classList.add('error');
            passwordErrorMessage.classList.add('show');
            signupBtn.disabled = true;
            return false;
        } else {
            passwordInput.classList.remove('error');
            passwordErrorMessage.classList.remove('show');
            return true;
        }
    }

    // Fonction pour vérifier et mettre à jour l'affichage de l'email
    async function validateEmail(email = null) {
        const emailToCheck = email !== null ? email : emailInput.value.trim();

        if (!emailToCheck) {
            emailInput.classList.remove('error');
            emailErrorMessage.classList.remove('show');
            return true;
        }

        try {
            const result = await checkEmailExists(emailToCheck);

            if (result.exists) {
                emailInput.classList.add('error');
                emailErrorMessage.classList.add('show');
                signupBtn.disabled = true;
                return false;
            } else {
                emailInput.classList.remove('error');
                emailErrorMessage.classList.remove('show');
                return true;
            }
        } catch (error) {
            emailInput.classList.add('error');
            signupBtn.disabled = true;
            return false;
        }
    }

    // Fonction pour vérifier si le formulaire peut être soumis
    function updateSubmitButton() {
        const emailValid = !emailInput.classList.contains('error') && emailInput.value.trim();
        const passwordValid = !passwordInput.classList.contains('error') && passwordInput.value;
        signupBtn.disabled = !(emailValid && passwordValid);
    }

    // Vérification en temps réel du mot de passe
    passwordInput.addEventListener('input', () => {
        clearTimeout(passwordCheckTimeout);
        passwordCheckTimeout = setTimeout(() => {
            validatePassword();
            updateSubmitButton();
        }, 300);
    });

    // Vérification en temps réel de l'email
    emailInput.addEventListener('input', () => {
        clearTimeout(emailCheckTimeout);
        emailCheckTimeout = setTimeout(() => {
            validateEmail();
            updateSubmitButton();
        }, 300);
    });

    // Vérification au départ du champ email
    emailInput.addEventListener('blur', () => {
        clearTimeout(emailCheckTimeout);
        validateEmail();
        updateSubmitButton();
    });

    // Vérification au départ du champ mot de passe
    passwordInput.addEventListener('blur', () => {
        clearTimeout(passwordCheckTimeout);
        validatePassword();
        updateSubmitButton();
    });

    // Vérification avant soumission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const first_name = document.getElementById('first_name').value.trim();
        const last_name = document.getElementById('last_name').value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!first_name || !last_name || !email || !password) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        // Vérifications finales
        const emailValid = await validateEmail(email);
        const passwordValid = validatePassword(password);

        if (!emailValid) {
            alert('Cette adresse email existe déjà');
            return;
        }

        if (!passwordValid) {
            alert('Le mot de passe n\'est pas assez robuste');
            return;
        }

        // Désactiver le bouton pendant l'envoi
        signupBtn.disabled = true;
        signupBtn.textContent = 'Création en cours...';

        const result = await signup(first_name, last_name, email, password);
        if (result.success) {
            // Afficher le modal de succès
            const successModal = document.getElementById('success-modal');
            successModal.style.display = 'block';

            // Gérer le clic sur le bouton "Se connecter"
            const loginBtn = document.getElementById('login-btn');
            loginBtn.addEventListener('click', () => {
                window.location.href = 'login.html';
            });
        } else {
            alert('Erreur: ' + result.error);
            signupBtn.disabled = false;
            signupBtn.textContent = 'Créer un compte';
        }
    });
});
// signup.js - Gestion de l'inscription
import { signup, checkEmailExists } from './userController.js';

window.addEventListener('load', () => {
    const emailInput = document.getElementById('email');
    const emailErrorMessage = document.getElementById('email-error-message');
    const passwordInput = document.getElementById('password');
    const passwordErrorMessage = document.getElementById('password-error-message');
    const signupBtn = document.getElementById('signup-btn');
    const signupForm = document.getElementById('signup-form');

    let passwordCheckTimeout;
    let isSubmitting = false; // Flag pour éviter les soumissions multiples

    function setEmailError(message) {
        emailInput.classList.add('error');
        emailErrorMessage.textContent = message;
        emailErrorMessage.classList.add('show');
    }

    function clearEmailError() {
        emailInput.classList.remove('error');
        emailErrorMessage.classList.remove('show');
    }

    function isEmailConflictMessage(message = '') {
        const lower = message.toLowerCase();
        return (
            lower.includes('deja') ||
            lower.includes('déjà') ||
            lower.includes('already') ||
            lower.includes('registered') ||
            lower.includes('duplicate') ||
            lower.includes('exists') ||
            lower.includes('taken')
        );
    }

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

    // Fonction pour vérifier si le formulaire peut être soumis
    function updateSubmitButton() {
        const emailValid = emailInput.value.trim();
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

    emailInput.addEventListener('input', () => {
        clearEmailError();
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

        if (isSubmitting) return; // Éviter les soumissions multiples

        const first_name = document.getElementById('first_name').value.trim();
        const last_name = document.getElementById('last_name').value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!first_name || !last_name || !email || !password) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        // Vérifications finales
        const passwordValid = validatePassword(password);

        if (!passwordValid) {
            alert('Le mot de passe n\'est pas assez robuste');
            return;
        }

        // Désactiver le bouton et marquer comme en cours
        isSubmitting = true;
        signupBtn.disabled = true;
        signupBtn.textContent = 'Création en cours...';

        // Vérifier si l'email existe déjà (côté serveur si configuré)
        const emailCheck = await checkEmailExists(email);
        if (emailCheck?.exists) {
            setEmailError('Cette adresse email existe déjà');
            isSubmitting = false;
            signupBtn.disabled = false;
            signupBtn.textContent = 'Créer un compte';
            return;
        }

        const result = await signup(first_name, last_name, email, password);
        if (result.success) {
            // Afficher le modal de succes (pas de redirection automatique)
            const successModal = document.getElementById('success-modal');
            successModal.style.display = 'block';

            const closeBtn = document.getElementById('close-signup-modal');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    successModal.style.display = 'none';
                });
            }
        } else {
            if (isEmailConflictMessage(result.error || '')) {
                setEmailError('Cette adresse email existe déjà');
            } else {
                alert('Erreur: ' + result.error);
            }
            isSubmitting = false;
            signupBtn.disabled = false;
            signupBtn.textContent = 'Créer un compte';
        }
    });
});




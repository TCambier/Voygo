/**
 * @voygo-doc
 * Module: signupController
 * Fichier: voygo\controllers\signupController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
// Gestion du formulaire d'inscription (validation front + appel API).
import { signup, checkEmailExists } from './userController.js';

window.addEventListener('load', () => {
    const emailInput = document.getElementById('email');
    const emailErrorMessage = document.getElementById('email-error-message');
    const passwordInput = document.getElementById('password');
    const passwordErrorMessage = document.getElementById('password-error-message');
    const signupBtn = document.getElementById('signup-btn');
    const signupForm = document.getElementById('signup-form');

    if (!emailInput || !emailErrorMessage || !passwordInput || !passwordErrorMessage || !signupBtn || !signupForm) {
        return;
    }

    let passwordCheckTimeout;
    let isSubmitting = false;

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
            lower.includes('already') ||
            lower.includes('registered') ||
            lower.includes('duplicate') ||
            lower.includes('exists') ||
            lower.includes('taken')
        );
    }

    // Validation locale du mot de passe: majuscule, minuscule, chiffre, symbole.
    function validatePassword(password = null) {
        const passwordToCheck = password !== null ? password : passwordInput.value;

        if (!passwordToCheck) {
            passwordInput.classList.remove('error');
            passwordErrorMessage.classList.remove('show');
            return true;
        }

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
        }

        passwordInput.classList.remove('error');
        passwordErrorMessage.classList.remove('show');
        return true;
    }

    // Active/desactive le bouton selon l'etat des champs.
    function updateSubmitButton() {
        const emailValid = emailInput.value.trim();
        const passwordValid = !passwordInput.classList.contains('error') && passwordInput.value;
        signupBtn.disabled = !(emailValid && passwordValid);
    }

    // Validation debounce pour eviter des calculs a chaque frappe.
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

    passwordInput.addEventListener('blur', () => {
        clearTimeout(passwordCheckTimeout);
        validatePassword();
        updateSubmitButton();
    });

    // Soumission finale du formulaire d'inscription.
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (isSubmitting) return;

        const first_name = document.getElementById('first_name').value.trim();
        const last_name = document.getElementById('last_name').value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!first_name || !last_name || !email || !password) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        const passwordValid = validatePassword(password);

        if (!passwordValid) {
            alert('Le mot de passe n\'est pas assez robuste');
            return;
        }

        isSubmitting = true;
        signupBtn.disabled = true;
        signupBtn.textContent = 'Creation en cours...';

        const emailCheck = await checkEmailExists(email);
        if (emailCheck?.exists) {
            setEmailError('Cette adresse email existe deja');
            isSubmitting = false;
            signupBtn.disabled = false;
            signupBtn.textContent = 'Creer un compte';
            return;
        }

        const result = await signup(first_name, last_name, email, password);
        if (result.success) {
            // Affiche le modal de succes (pas de redirection forcee).
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
                setEmailError('Cette adresse email existe deja');
            } else {
                alert('Erreur: ' + result.error);
            }
            isSubmitting = false;
            signupBtn.disabled = false;
            signupBtn.textContent = 'Creer un compte';
            return;
        }

        isSubmitting = false;
        signupBtn.disabled = false;
        signupBtn.textContent = 'Creer un compte';
    });
});




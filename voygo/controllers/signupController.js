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
    const firstNameInput = document.getElementById('first_name');
    const firstNameErrorMessage = document.getElementById('first-name-error-message');
    const lastNameInput = document.getElementById('last_name');
    const lastNameErrorMessage = document.getElementById('last-name-error-message');
    const emailInput = document.getElementById('email');
    const emailErrorMessage = document.getElementById('email-error-message');
    const passwordInput = document.getElementById('password');
    const passwordErrorMessage = document.getElementById('password-error-message');
    const signupBtn = document.getElementById('signup-btn');
    const signupForm = document.getElementById('signup-form');

    if (
        !firstNameInput ||
        !firstNameErrorMessage ||
        !lastNameInput ||
        !lastNameErrorMessage ||
        !emailInput ||
        !emailErrorMessage ||
        !passwordInput ||
        !passwordErrorMessage ||
        !signupBtn ||
        !signupForm
    ) {
        return;
    }

    let passwordCheckTimeout;
    let isSubmitting = false;

    const SUSPICIOUS_PATTERNS = [
        { label: '<script>', regex: /<\s*script\b[^>]*>/i },
        { label: '</script>', regex: /<\s*\/\s*script\s*>/i },
        { label: 'javascript:', regex: /javascript\s*:/i },
        { label: 'on*= (event handler)', regex: /on[a-z]+\s*=/i },
        { label: '<tag>', regex: /<[^>]+>/ }
    ];

    function findSuspiciousTerm(value = '') {
        const input = String(value || '');
        for (const pattern of SUSPICIOUS_PATTERNS) {
            const match = input.match(pattern.regex);
            if (match) {
                return match[0] || pattern.label;
            }
        }
        return null;
    }

    function setFieldError(inputElement, errorElement, message) {
        inputElement.classList.add('error');
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }

    function clearFieldError(inputElement, errorElement) {
        inputElement.classList.remove('error');
        errorElement.classList.remove('show');
        errorElement.textContent = '';
    }

    function setEmailError(message) {
        setFieldError(emailInput, emailErrorMessage, message);
    }

    function clearEmailError() {
        clearFieldError(emailInput, emailErrorMessage);
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
            clearFieldError(passwordInput, passwordErrorMessage);
            return true;
        }

        const suspiciousTerm = findSuspiciousTerm(passwordToCheck);
        if (suspiciousTerm) {
            setFieldError(
                passwordInput,
                passwordErrorMessage,
                `Mot de passe refuse: terme suspect detecte (${suspiciousTerm}).`
            );
            signupBtn.disabled = true;
            return false;
        }

        const hasUpperCase = /[A-Z]/.test(passwordToCheck);
        const hasLowerCase = /[a-z]/.test(passwordToCheck);
        const hasNumbers = /\d/.test(passwordToCheck);
        const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(passwordToCheck);

        const isValid = hasUpperCase && hasLowerCase && hasNumbers && hasSymbols;

        if (!isValid) {
            setFieldError(
                passwordInput,
                passwordErrorMessage,
                'Le mot de passe doit contenir au minimum une majuscule, une minuscule, un chiffre et un symbole.'
            );
            signupBtn.disabled = true;
            return false;
        }

        clearFieldError(passwordInput, passwordErrorMessage);
        return true;
    }

    function validateNameField(inputElement, errorElement, fieldLabel) {
        const value = inputElement.value.trim();

        if (!value) {
            clearFieldError(inputElement, errorElement);
            return false;
        }

        const suspiciousTerm = findSuspiciousTerm(value);
        if (suspiciousTerm) {
            setFieldError(
                inputElement,
                errorElement,
                `${fieldLabel} refuse: terme suspect detecte (${suspiciousTerm}).`
            );
            return false;
        }

        clearFieldError(inputElement, errorElement);
        return true;
    }

    function validateEmailField() {
        const value = emailInput.value.trim();

        if (!value) {
            clearEmailError();
            return false;
        }

        const suspiciousTerm = findSuspiciousTerm(value);
        if (suspiciousTerm) {
            setEmailError(`Email refuse: terme suspect detecte (${suspiciousTerm}).`);
            return false;
        }

        const basicEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!basicEmailPattern.test(value)) {
            setEmailError('Format email invalide.');
            return false;
        }

        clearEmailError();
        return true;
    }

    // Active/desactive le bouton selon l'etat des champs.
    function updateSubmitButton() {
        const firstNameValid = firstNameInput.value.trim() && !firstNameInput.classList.contains('error');
        const lastNameValid = lastNameInput.value.trim() && !lastNameInput.classList.contains('error');
        const emailValid = emailInput.value.trim() && !emailInput.classList.contains('error');
        const passwordValid = passwordInput.value && !passwordInput.classList.contains('error');

        signupBtn.disabled = isSubmitting || !(firstNameValid && lastNameValid && emailValid && passwordValid);
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
        validateEmailField();
        updateSubmitButton();
    });

    firstNameInput.addEventListener('input', () => {
        validateNameField(firstNameInput, firstNameErrorMessage, 'Prenom');
        updateSubmitButton();
    });

    lastNameInput.addEventListener('input', () => {
        validateNameField(lastNameInput, lastNameErrorMessage, 'Nom');
        updateSubmitButton();
    });

    firstNameInput.addEventListener('blur', () => {
        validateNameField(firstNameInput, firstNameErrorMessage, 'Prenom');
        updateSubmitButton();
    });

    lastNameInput.addEventListener('blur', () => {
        validateNameField(lastNameInput, lastNameErrorMessage, 'Nom');
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
        const password = passwordInput.value;

        if (!first_name || !last_name || !email || !password) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        const firstNameValid = validateNameField(firstNameInput, firstNameErrorMessage, 'Prenom');
        const lastNameValid = validateNameField(lastNameInput, lastNameErrorMessage, 'Nom');
        const emailValid = validateEmailField();
        const passwordValid = validatePassword(password);

        if (!firstNameValid || !lastNameValid || !emailValid || !passwordValid) {
            updateSubmitButton();
            return;
        }

        isSubmitting = true;
        signupBtn.disabled = true;
        signupBtn.textContent = 'Creation en cours...';

        const emailCheck = await checkEmailExists(email);
        if (emailCheck?.exists) {
            setEmailError('Cette adresse email existe deja');
            isSubmitting = false;
            updateSubmitButton();
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
            updateSubmitButton();
            signupBtn.textContent = 'Creer un compte';
            return;
        }

        isSubmitting = false;
        updateSubmitButton();
        signupBtn.textContent = 'Creer un compte';
    });

    updateSubmitButton();
});




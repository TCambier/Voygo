import { requestPasswordReset } from './userController.js';

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('forgot-password-modal');
    const link = document.getElementById('forgot-password-link');
    const span = document.getElementsByClassName('close')[0];
    const sendBtn = document.getElementById('send-btn');
    const emailInput = document.getElementById('forgot-email');
    const feedback = document.getElementById('forgot-feedback');

    function openModal() {
        modal.style.display = 'block';
        feedback.textContent = '';
        feedback.classList.remove('is-success', 'is-error');
        emailInput.focus();
    }

    function closeModal() {
        modal.style.display = 'none';
    }

    link.onclick = (event) => {
        event.preventDefault();
        openModal();
    };

    span.onclick = closeModal;

    window.onclick = (event) => {
        if (event.target === modal) {
            closeModal();
        }
    };

    sendBtn.onclick = async () => {
        const email = emailInput.value.trim();
        feedback.textContent = '';
        feedback.classList.remove('is-success', 'is-error');

        if (!email) {
            feedback.textContent = 'Veuillez entrer un email valide.';
            feedback.classList.add('is-error');
            return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Envoi en cours...';

        const result = await requestPasswordReset(email);
        if (result.success) {
            feedback.textContent = 'Email envoyé. Vérifiez votre boîte de réception.';
            feedback.classList.add('is-success');
        } else {
            feedback.textContent = result.error || 'Impossible d’envoyer l’email.';
            feedback.classList.add('is-error');
        }

        sendBtn.disabled = false;
        sendBtn.textContent = 'Envoyer';
    };
});

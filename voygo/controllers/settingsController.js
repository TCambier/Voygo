import { api } from '../assets/js/api.js';

const profileForm = document.getElementById('profile-form');
const emailForm = document.getElementById('email-form');
const passwordForm = document.getElementById('password-form');
const deleteButton = document.getElementById('delete-account');

const profileFeedback = document.getElementById('profile-feedback');
const emailFeedback = document.getElementById('email-feedback');
const passwordFeedback = document.getElementById('password-feedback');
const deleteFeedback = document.getElementById('delete-feedback');

const firstNameInput = document.getElementById('first-name');
const lastNameInput = document.getElementById('last-name');
const emailInput = document.getElementById('email');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');

function setFeedback(node, message, type = 'info') {
  if (!node) return;
  node.textContent = message;
  node.classList.remove('is-success', 'is-error');
  if (type === 'success') node.classList.add('is-success');
  if (type === 'error') node.classList.add('is-error');
}

async function loadUserProfile() {
  try {
    const result = await api.get('/api/auth/me');
    const user = result?.user;
    if (!user) return;

    if (firstNameInput) firstNameInput.value = user.first_name || '';
    if (lastNameInput) lastNameInput.value = user.last_name || '';
    if (emailInput) emailInput.value = user.email || '';
  } catch (error) {
    return;
  }
}

profileForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const first_name = firstNameInput.value.trim();
  const last_name = lastNameInput.value.trim();

  if (!first_name || !last_name) {
    setFeedback(profileFeedback, 'Merci de renseigner votre prenom et votre nom.', 'error');
    return;
  }

  setFeedback(profileFeedback, 'Mise a jour en cours...');

  try {
    await api.patch('/api/auth/profile', { first_name, last_name });
    setFeedback(profileFeedback, 'Profil mis a jour.', 'success');
  } catch (error) {
    setFeedback(profileFeedback, error.message || 'Impossible de mettre a jour le profil.', 'error');
  }
});

emailForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  if (!email) {
    setFeedback(emailFeedback, 'Merci de saisir un email valide.', 'error');
    return;
  }

  setFeedback(emailFeedback, 'Mise a jour en cours...');

  try {
    await api.post('/api/auth/email', { email });
    setFeedback(emailFeedback, 'Un email de confirmation a ete envoye.', 'success');
  } catch (error) {
    setFeedback(emailFeedback, error.message || 'Impossible de mettre a jour l\'email.', 'error');
  }
});

passwordForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = newPasswordInput.value.trim();
  const confirm = confirmPasswordInput.value.trim();

  if (!password) {
    setFeedback(passwordFeedback, 'Merci de saisir un nouveau mot de passe.', 'error');
    return;
  }

  if (password !== confirm) {
    setFeedback(passwordFeedback, 'Les mots de passe ne correspondent pas.', 'error');
    return;
  }

  setFeedback(passwordFeedback, 'Mise a jour en cours...');

  try {
    await api.post('/api/auth/password', { password });
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    setFeedback(passwordFeedback, 'Mot de passe mis a jour.', 'success');
  } catch (error) {
    setFeedback(passwordFeedback, error.message || 'Impossible de mettre a jour le mot de passe.', 'error');
  }
});

deleteButton?.addEventListener('click', async () => {
  const confirmDelete = window.confirm('Confirmez-vous la suppression definitive de votre compte ?');
  if (!confirmDelete) return;

  setFeedback(deleteFeedback, 'Suppression en cours...');

  try {
    await api.post('/api/auth/delete');
    window.location.href = 'signup.html';
  } catch (error) {
    setFeedback(
      deleteFeedback,
      error.message || 'Impossible de supprimer le compte pour le moment.',
      'error'
    );
  }
});

loadUserProfile();


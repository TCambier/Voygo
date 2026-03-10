import { supabase } from '../assets/js/supabase.js';

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

function updateLocalUser(update) {
  try {
    const raw = localStorage.getItem('voygo_auth_user');
    if (!raw) return;
    const current = JSON.parse(raw);
    const next = { ...current, ...update };
    localStorage.setItem('voygo_auth_user', JSON.stringify(next));
  } catch (error) {
    // ignore
  }
}

async function loadUserProfile() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return;

  const user = data.user;
  const meta = user.user_metadata || {};

  if (firstNameInput) firstNameInput.value = meta.first_name || '';
  if (lastNameInput) lastNameInput.value = meta.last_name || '';
  if (emailInput) emailInput.value = user.email || '';
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

  const { data, error } = await supabase.auth.updateUser({
    data: { first_name, last_name }
  });

  if (error) {
    setFeedback(profileFeedback, error.message || 'Impossible de mettre a jour le profil.', 'error');
    return;
  }

  updateLocalUser({ first_name, last_name, email: data?.user?.email || emailInput.value });
  setFeedback(profileFeedback, 'Profil mis a jour.', 'success');
});

emailForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  if (!email) {
    setFeedback(emailFeedback, 'Merci de saisir un email valide.', 'error');
    return;
  }

  setFeedback(emailFeedback, 'Mise a jour en cours...');

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    setFeedback(emailFeedback, error.message || 'Impossible de mettre a jour l\'email.', 'error');
    return;
  }

  setFeedback(emailFeedback, 'Un email de confirmation a ete envoye.', 'success');
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

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    setFeedback(passwordFeedback, error.message || 'Impossible de mettre a jour le mot de passe.', 'error');
    return;
  }

  newPasswordInput.value = '';
  confirmPasswordInput.value = '';
  setFeedback(passwordFeedback, 'Mot de passe mis a jour.', 'success');
});

deleteButton?.addEventListener('click', async () => {
  const confirmDelete = window.confirm('Confirmez-vous la suppression definitive de votre compte ?');
  if (!confirmDelete) return;

  setFeedback(deleteFeedback, 'Suppression en cours...');

  const { error } = await supabase.functions.invoke('delete-account');
  if (error) {
    setFeedback(
      deleteFeedback,
      "Impossible de supprimer le compte. Configurez la fonction 'delete-account' cote serveur.",
      'error'
    );
    return;
  }

  await supabase.auth.signOut();
  localStorage.removeItem('voygo_auth_user');
  localStorage.removeItem('voygo_jwt');
  window.location.href = 'signup.html';
});

loadUserProfile();


/**
 * @voygo-doc
 * Module: authGuardController
 * Fichier: voygo\controllers\authGuardController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
// Garde d'authentification pour les pages privees.
import { api } from '../assets/js/api.js';

// Gere la logique principale de 'requireAuth'.
export async function requireAuth() {
  // Recompose l'URL courante (page + query string) pour pouvoir y revenir apres connexion.
  const returnTo = `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search || ''}`;

  try {
    // Interroge l'API pour recuperer l'utilisateur de la session active.
    const data = await api.get('/api/auth/me');
    // Extrait l'identifiant utilisateur de maniere defensive (optional chaining).
    const userId = data?.user?.id;
    // Si aucun utilisateur valide n'est retourne, on redirige vers la page de connexion.
    if (!userId) {
      // On transmet returnTo pour revenir sur la page initiale apres authentification.
      window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
      // Retourne null pour signaler explicitement l'absence d'utilisateur authentifie.
      return null;
    }
    // Session valide: on retourne l'objet utilisateur au code appelant.
    return data.user;
  } catch (error) {
    // Toute erreur reseau/API est traitee comme une session non valide.
    window.location.href = `login.html?returnTo=${encodeURIComponent(returnTo)}`;
    // Retourne null pour garder un contrat de retour coherent en cas d'echec.
    return null;
  }
}

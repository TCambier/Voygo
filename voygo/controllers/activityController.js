/**
 * @voygo-doc
 * Module: activityController
 * Fichier: voygo\controllers\activityController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

// Activities table helpers
export async function listActivities() {
    const result = await api.get('/api/activities');
    return result?.data || [];
}

// Cree les donnees gerees par 'createActivity'.
export async function createActivity(item) {
    const result = await api.post('/api/activities', item);
    return result?.data;
}

// Applique les mises a jour de 'updateActivity'.
export async function updateActivity(id, changes) {
    const result = await api.patch(`/api/activities/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

// Supprime les donnees ciblees par 'deleteActivity'.
export async function deleteActivity(id) {
    const result = await api.delete(`/api/activities/${encodeURIComponent(id)}`);
    return result;
}

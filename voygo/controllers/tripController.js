/**
 * @voygo-doc
 * Module: tripController
 * Fichier: voygo\controllers\tripController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

// Helpers for the `trips` table. Adjust table/column names to match your
// Supabase schema.

export async function listTrips() {
    const result = await api.get('/api/trips');
    return result?.data || [];
}

// Cree les donnees gerees par 'createTrip'.
export async function createTrip(trip) {
    const result = await api.post('/api/trips', trip);
    return result?.data;
}

// Applique les mises a jour de 'updateTrip'.
export async function updateTrip(id, changes) {
    const result = await api.patch(`/api/trips/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

// Supprime les donnees ciblees par 'deleteTrip'.
export async function deleteTrip(id) {
    const result = await api.delete(`/api/trips/${encodeURIComponent(id)}`);
    return result;
}

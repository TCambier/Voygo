/**
 * @voygo-doc
 * Module: accommodationController
 * Fichier: voygo\controllers\accommodationController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

// CRUD helpers for accommodations table.
export async function listAccommodations() {
    const result = await api.get('/api/accommodations');
    return result?.data || [];
}

// Liste les elements retournes par 'listAccommodationsByTrip'.
export async function listAccommodationsByTrip(tripId) {
    if (!tripId) return [];
    const result = await api.get(`/api/accommodations?tripId=${encodeURIComponent(tripId)}`);
    return result?.data || [];
}

// Cree les donnees gerees par 'createAccommodation'.
export async function createAccommodation(item) {
    const result = await api.post('/api/accommodations', item);
    return result?.data;
}

// Applique les mises a jour de 'updateAccommodation'.
export async function updateAccommodation(id, changes) {
    const result = await api.patch(`/api/accommodations/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

// Supprime les donnees ciblees par 'deleteAccommodation'.
export async function deleteAccommodation(id) {
    const result = await api.delete(`/api/accommodations/${encodeURIComponent(id)}`);
    return result;
}

/**
 * @voygo-doc
 * Module: transportController
 * Fichier: voygo\controllers\transportController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

// Transport table helpers
export async function listTransports(tripId) {
    if (!tripId) throw new Error('Trip ID requis');
    const result = await api.get(`/api/transports/trip/${encodeURIComponent(tripId)}`);
    return result?.data || [];
}

// Cree les donnees gerees par 'createTransport'.
export async function createTransport(tripId, item) {
    if (!tripId) throw new Error('Trip ID requis');
    const result = await api.post(`/api/transports/trip/${encodeURIComponent(tripId)}`, item);
    return result?.data;
}

// Applique les mises a jour de 'updateTransport'.
export async function updateTransport(id, changes) {
    const result = await api.patch(`/api/transports/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

// Supprime les donnees ciblees par 'deleteTransport'.
export async function deleteTransport(id) {
    const result = await api.delete(`/api/transports/${encodeURIComponent(id)}`);
    return result;
}

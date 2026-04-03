/**
 * @voygo-doc
 * Module: budgetController
 * Fichier: voygo\controllers\budgetController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

// Budgets table helpers
export async function listBudgets(tripId = '') {
    const normalizedTripId = String(tripId || '').trim();
    const endpoint = normalizedTripId
        ? `/api/budgets?tripId=${encodeURIComponent(normalizedTripId)}`
        : '/api/budgets';
    const result = await api.get(endpoint);
    return result?.data || [];
}

// Cree les donnees gerees par 'createBudget'.
export async function createBudget(item) {
    const result = await api.post('/api/budgets', item);
    return result?.data;
}

// Applique les mises a jour de 'updateBudget'.
export async function updateBudget(id, changes) {
    const result = await api.patch(`/api/budgets/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

// Supprime les donnees ciblees par 'deleteBudget'.
export async function deleteBudget(id) {
    const result = await api.delete(`/api/budgets/${encodeURIComponent(id)}`);
    return result;
}

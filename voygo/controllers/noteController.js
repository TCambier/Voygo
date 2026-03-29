/**
 * @voygo-doc
 * Module: noteController
 * Fichier: voygo\controllers\noteController.js
 * Role: Module JavaScript du projet Voygo.
 * Note: Ajouter les changements metier ici et garder la coherence avec les modules dependants.
 */
import { api } from '../assets/js/api.js';

// Notes table helpers
export async function listNotes() {
    const result = await api.get('/api/notes');
    return result?.data || [];
}

// Cree les donnees gerees par 'createNote'.
export async function createNote(item) {
    const result = await api.post('/api/notes', item);
    return result?.data;
}

// Applique les mises a jour de 'updateNote'.
export async function updateNote(id, changes) {
    const result = await api.patch(`/api/notes/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

// Supprime les donnees ciblees par 'deleteNote'.
export async function deleteNote(id) {
    const result = await api.delete(`/api/notes/${encodeURIComponent(id)}`);
    return result;
}

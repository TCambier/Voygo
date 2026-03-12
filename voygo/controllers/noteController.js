import { api } from '../assets/js/api.js';

// Notes table helpers
export async function listNotes() {
    const result = await api.get('/api/notes');
    return result?.data || [];
}

export async function createNote(item) {
    const result = await api.post('/api/notes', item);
    return result?.data;
}

export async function updateNote(id, changes) {
    const result = await api.patch(`/api/notes/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

export async function deleteNote(id) {
    const result = await api.delete(`/api/notes/${encodeURIComponent(id)}`);
    return result;
}

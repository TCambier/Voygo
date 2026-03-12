import { api } from '../assets/js/api.js';

// CRUD helpers for accommodations table.
export async function listAccommodations() {
    const result = await api.get('/api/accommodations');
    return result?.data || [];
}

export async function createAccommodation(item) {
    const result = await api.post('/api/accommodations', item);
    return result?.data;
}

export async function updateAccommodation(id, changes) {
    const result = await api.patch(`/api/accommodations/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

export async function deleteAccommodation(id) {
    const result = await api.delete(`/api/accommodations/${encodeURIComponent(id)}`);
    return result;
}

import { api } from '../assets/js/api.js';

// Activities table helpers
export async function listActivities() {
    const result = await api.get('/api/activities');
    return result?.data || [];
}

export async function createActivity(item) {
    const result = await api.post('/api/activities', item);
    return result?.data;
}

export async function updateActivity(id, changes) {
    const result = await api.patch(`/api/activities/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

export async function deleteActivity(id) {
    const result = await api.delete(`/api/activities/${encodeURIComponent(id)}`);
    return result;
}

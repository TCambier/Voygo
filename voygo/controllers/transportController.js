import { api } from '../assets/js/api.js';

// Transport table helpers
export async function listTransports(tripId) {
    if (!tripId) throw new Error('Trip ID requis');
    const result = await api.get(`/api/transports/trip/${encodeURIComponent(tripId)}`);
    return result?.data || [];
}

export async function createTransport(tripId, item) {
    if (!tripId) throw new Error('Trip ID requis');
    const result = await api.post(`/api/transports/trip/${encodeURIComponent(tripId)}`, item);
    return result?.data;
}

export async function updateTransport(id, changes) {
    const result = await api.patch(`/api/transports/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

export async function deleteTransport(id) {
    const result = await api.delete(`/api/transports/${encodeURIComponent(id)}`);
    return result;
}

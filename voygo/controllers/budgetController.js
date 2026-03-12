import { api } from '../assets/js/api.js';

// Budgets table helpers
export async function listBudgets() {
    const result = await api.get('/api/budgets');
    return result?.data || [];
}

export async function createBudget(item) {
    const result = await api.post('/api/budgets', item);
    return result?.data;
}

export async function updateBudget(id, changes) {
    const result = await api.patch(`/api/budgets/${encodeURIComponent(id)}`, changes);
    return result?.data;
}

export async function deleteBudget(id) {
    const result = await api.delete(`/api/budgets/${encodeURIComponent(id)}`);
    return result;
}

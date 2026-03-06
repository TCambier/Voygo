import { supabase } from '../assets/js/supabase.js';

// Budgets table helpers
export async function listBudgets() {
    const { data, error } = await supabase.from('budgets').select('*');
    if (error) throw error;
    return data;
}

export async function createBudget(item) {
    const { data, error } = await supabase.from('budgets').insert(item);
    if (error) throw error;
    return data;
}

export async function updateBudget(id, changes) {
    const { data, error } = await supabase.from('budgets').update(changes).eq('id', id);
    if (error) throw error;
    return data;
}

export async function deleteBudget(id) {
    const { data, error } = await supabase.from('budgets').delete().eq('id', id);
    if (error) throw error;
    return data;
}
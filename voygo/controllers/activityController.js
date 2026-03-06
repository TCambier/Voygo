import { supabase } from '../assets/js/supabase.js';

// Activities table helpers
export async function listActivities() {
    const { data, error } = await supabase.from('activities').select('*');
    if (error) throw error;
    return data;
}

export async function createActivity(item) {
    const { data, error } = await supabase.from('activities').insert(item);
    if (error) throw error;
    return data;
}

export async function updateActivity(id, changes) {
    const { data, error } = await supabase.from('activities').update(changes).eq('id', id);
    if (error) throw error;
    return data;
}

export async function deleteActivity(id) {
    const { data, error } = await supabase.from('activities').delete().eq('id', id);
    if (error) throw error;
    return data;
}
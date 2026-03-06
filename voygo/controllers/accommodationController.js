import { supabase } from '../assets/js/supabase.js';

// CRUD helpers for accommodations table.
export async function listAccommodations() {
    const { data, error } = await supabase.from('accommodations').select('*');
    if (error) throw error;
    return data;
}

export async function createAccommodation(item) {
    const { data, error } = await supabase.from('accommodations').insert(item);
    if (error) throw error;
    return data;
}

export async function updateAccommodation(id, changes) {
    const { data, error } = await supabase.from('accommodations').update(changes).eq('id', id);
    if (error) throw error;
    return data;
}

export async function deleteAccommodation(id) {
    const { data, error } = await supabase.from('accommodations').delete().eq('id', id);
    if (error) throw error;
    return data;
}
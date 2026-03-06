import { supabase } from '../assets/js/supabase.js';

// Notes table helpers
export async function listNotes() {
    const { data, error } = await supabase.from('notes').select('*');
    if (error) throw error;
    return data;
}

export async function createNote(item) {
    const { data, error } = await supabase.from('notes').insert(item);
    if (error) throw error;
    return data;
}

export async function updateNote(id, changes) {
    const { data, error } = await supabase.from('notes').update(changes).eq('id', id);
    if (error) throw error;
    return data;
}

export async function deleteNote(id) {
    const { data, error } = await supabase.from('notes').delete().eq('id', id);
    if (error) throw error;
    return data;
}
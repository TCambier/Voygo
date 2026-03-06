import { supabase } from '../assets/js/supabase.js';

// Transport table helpers
export async function listTransports() {
    const { data, error } = await supabase.from('transports').select('*');
    if (error) throw error;
    return data;
}

export async function createTransport(item) {
    const { data, error } = await supabase.from('transports').insert(item);
    if (error) throw error;
    return data;
}

export async function updateTransport(id, changes) {
    const { data, error } = await supabase.from('transports').update(changes).eq('id', id);
    if (error) throw error;
    return data;
}

export async function deleteTransport(id) {
    const { data, error } = await supabase.from('transports').delete().eq('id', id);
    if (error) throw error;
    return data;
}
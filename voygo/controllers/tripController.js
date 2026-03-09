import { supabase } from '../assets/js/supabase.js';

// Helpers for the `trips` table. Adjust table/column names to match your
// Supabase schema.

export async function listTrips() {
    const { data, error } = await supabase.from('trips').select('*');
    if (error) throw error;
    return data;
}

export async function createTrip(trip) {
    const { data, error } = await supabase.from('trips').insert(trip);
    if (error) throw error;
    return data;
}

export async function updateTrip(id, changes) {
    const { data, error } = await supabase.from('trips').update(changes).eq('id', id);
    if (error) throw error;
    return data;
}

export async function deleteTrip(id) {
    const { data, error } = await supabase.from('trips').delete().eq('id', id);
    if (error) throw error;
    return data;
}

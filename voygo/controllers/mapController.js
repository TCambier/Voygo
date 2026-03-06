// mapController.js
// Responsible for rendering the Leaflet map. Data such as markers or
// locations can be pulled from Supabase if you'd like to persist them.

// import { supabase } from '../assets/js/supabase.js';

// export async function loadMarkersForTrip(tripId) {
//     const { data, error } = await supabase.from('markers').select('*').eq('trip_id', tripId);
//     if (error) throw error;
//     return data;
// }
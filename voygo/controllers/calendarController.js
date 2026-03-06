// calendarController.js
// This controller handles calendar UI logic. The calendar data can be
// fetched or stored in Supabase using the shared client located in
// `../assets/js/supabase.js` if necessary.

// Example:
// import { supabase } from '../assets/js/supabase.js';

// export async function fetchCalendarEntries(tripId) {
//     const { data, error } = await supabase.from('calendar_entries').select('*').eq('trip_id', tripId);
//     if (error) throw error;
//     return data;
// }

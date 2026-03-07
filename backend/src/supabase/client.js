const { createClient } = require('@supabase/supabase-js');
// Environment variables are loaded in server.js

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE;

if (!supabaseUrl) {
    throw new Error('No Supabase URL found (SUPABASE_URL)');
}

if (!supabaseKey) {
    throw new Error('No Supabase key found (SUPABASE)');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };

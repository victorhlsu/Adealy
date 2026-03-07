const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

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

const { createClient } = require('@supabase/supabase-js');
const dotnetConfig = require('dotenv');
const path = require('path');
dotnetConfig.config({ path: path.resolve(__dirname, '../../.env') });

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

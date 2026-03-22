const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
// Use SERVICE_ROLE_KEY for backend operations (required)
const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Advertencia: SUPABASE_URL o KEY no definidos en variables de entorno.');
}

// Inicializamos el cliente
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

module.exports = supabase;

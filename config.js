// Einstellungen für die Online-Anmeldung mit Supabase (siehe SUPABASE.md).
// Solange beide Werte leer sind, nutzt die App die Anmeldung nur auf diesem Gerät.
// Der „anon key“ darf öffentlich sein – die Daten schützt die Datenbank (Row Level Security).
window.FF_CONFIG = {
  supabaseUrl: '',      // z. B. 'https://abcdefgh.supabase.co'
  supabaseAnonKey: '',  // langer Schlüssel „anon public“
};

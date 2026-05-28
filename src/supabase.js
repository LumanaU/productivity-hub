import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || "";

export const supabaseReady = !!(supabaseUrl && supabaseKey);

if (!supabaseReady) {
  console.warn("Missing Supabase env vars — app will run in offline mode.");
}

export const supabase = supabaseReady
  ? createClient(supabaseUrl, supabaseKey)
  : null;

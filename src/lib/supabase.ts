import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const demoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false';

if (!demoMode && (!url || !key)) {
  throw new Error('Live mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = !demoMode && url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export const functionsUrl = (import.meta.env.VITE_FUNCTIONS_URL as string | undefined)
  || (url ? `${url.replace(/\/$/, '')}/functions/v1` : '');

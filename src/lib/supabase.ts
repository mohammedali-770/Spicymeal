import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const demoMode = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false';
export const supabase = !demoMode && url && key ? createClient(url, key) : null;
export const functionsUrl = (import.meta.env.VITE_FUNCTIONS_URL as string | undefined) || (url ? `${url}/functions/v1` : '');

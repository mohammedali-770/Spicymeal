import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://esm.sh; style-src 'self'; connect-src 'self' https://esm.sh https://daifcmqjtkmkxxxnnyos.supabase.co wss://daifcmqjtkmkxxxnnyos.supabase.co; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

Deno.serve(async (request) => {
  const pathname = new URL(request.url).pathname;
  const assetPath = pathname.endsWith('/app.js')
    ? '/app.js'
    : pathname.endsWith('/styles.css')
      ? '/styles.css'
      : '/';

  const { data, error } = await admin
    .from('wa_web_assets')
    .select('content_type,body')
    .eq('path', assetPath)
    .maybeSingle();

  if (error) {
    console.error('Unable to load web asset', error.message);
    return new Response('Web console unavailable', { status: 500, headers: securityHeaders });
  }
  if (!data) return new Response('Not found', { status: 404, headers: securityHeaders });

  return new Response(data.body, {
    status: 200,
    headers: { ...securityHeaders, 'Content-Type': data.content_type },
  });
});

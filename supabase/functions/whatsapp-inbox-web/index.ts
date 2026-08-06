import html from './app.html' with { type: 'text' };
import js from './app.js' with { type: 'text' };
import css from './styles.css' with { type: 'text' };

const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://esm.sh; style-src 'self'; connect-src 'self' https://esm.sh https://daifcmqjtkmkxxxnnyos.supabase.co wss://daifcmqjtkmkxxxnnyos.supabase.co; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

Deno.serve((request) => {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/app.js')) return new Response(js, { headers: { ...securityHeaders, 'Content-Type': 'text/javascript; charset=utf-8' } });
  if (path.endsWith('/styles.css')) return new Response(css, { headers: { ...securityHeaders, 'Content-Type': 'text/css; charset=utf-8' } });
  return new Response(html, { headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
});

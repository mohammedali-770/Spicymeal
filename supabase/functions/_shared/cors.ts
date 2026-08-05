function allowedOrigins() {
  return (Deno.env.get('APP_ORIGINS') ?? 'http://localhost:3000')
    .split(',').map((value) => value.trim()).filter(Boolean);
}

export function corsHeaders(request?: Request) {
  const origin = request?.headers.get('origin') ?? '';
  const allowed = allowedOrigins();
  const selected = allowed.includes(origin) ? origin : allowed[0] ?? 'http://localhost:3000';
  return {
    'Access-Control-Allow-Origin': selected,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(body: unknown, status = 200, request?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}

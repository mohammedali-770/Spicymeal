Deno.serve(() => new Response(
  JSON.stringify({ error: 'Web hosting is pending GitHub Pages enablement' }),
  { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
));

import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async ({ request, redirect }, next) => {
  const url = new URL(request.url);

  // Skip API routes, files with extensions, and URLs that already have trailing slash
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/') ||
    url.pathname.includes('.')
  ) {
    return next();
  }

  // Redirect to trailing slash version
  return redirect(url.pathname + '/' + url.search, 301);
});

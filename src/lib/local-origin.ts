// Next may normalize request.url to localhost although the browser uses 127.0.0.1.
// Compare the browser Origin to the actual Host, and require a loopback address.
export function isLocalOrigin(request: Request) {
  try {
    const origin = new URL(request.headers.get('origin') ?? '');
    return (
      ['http:', 'https:'].includes(origin.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) &&
      origin.host === request.headers.get('host')
    );
  } catch {
    return false;
  }
}

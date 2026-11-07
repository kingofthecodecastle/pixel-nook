// Set this public publisher ID only after verifying Codecastle's AdMob account.
// Missing configuration must never advertise an invented or demo seller.
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end('Method not allowed\n');
  }
  const publisher = process.env.ADMOB_PUBLISHER_ID || '';
  const valid = publisher.length === 20 && /^pub-\d{16}$/.test(publisher)
    && !['pub-0000000000000000', 'pub-3940256099942544'].includes(publisher);
  res.statusCode = valid ? 200 : 404;
  if (valid) res.setHeader('Cache-Control', 'public, max-age=300');
  return res.end(req.method === 'HEAD' ? '' : valid
    ? `google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`
    : 'Advertising publisher is not configured.\n');
}

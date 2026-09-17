const { timingSafeEqual } = require('node:crypto');
const { json, methodGuard } = require('../_lib/http');
const analytics = require('../_lib/analytics-store');
const { verifyAppOrigin } = require('../_lib/app-origin');

function timingSafeEquals(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isAdminRequest(req) {
  const expected = String(process.env.ANALYTICS_ADMIN_TOKEN || '').trim();
  if (!expected) return false;

  const header = String(req.headers['x-admin-token'] || '').trim();
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return timingSafeEquals(header, expected) || timingSafeEquals(bearer, expected);
}

// The host/origin check only stops cross-origin browser calls, so anything this
// endpoint returns is effectively public. Strip per-user fields unless the
// caller proves it is an operator with ANALYTICS_ADMIN_TOKEN.
function redactEvent(event) {
  return {
    id: event.id,
    timestamp: event.timestamp,
    source: event.source,
    event: event.event
  };
}

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, 'GET')) return;

  try {
    const origin = verifyAppOrigin(req);
    if (!origin.ok) {
      console.warn(
        JSON.stringify({
          event: 'analytics.state.forbidden_host',
          requestHost: origin.requestHost,
          originHost: origin.originHost,
          refererHost: origin.refererHost,
          allowedHosts: origin.allowedHosts
        })
      );
      return json(res, 403, {
        ok: false,
        error: 'Forbidden host',
        requestHost: origin.requestHost,
        originHost: origin.originHost,
        refererHost: origin.refererHost,
        allowedHosts: origin.allowedHosts
      });
    }

    const limitRaw = Number(req.query?.limit || 20);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;

    const [summary, recentRaw] = await Promise.all([
      analytics.getSummary(),
      analytics.getRecent(limit)
    ]);

    const admin = isAdminRequest(req);
    const recent = admin ? recentRaw : recentRaw.map(redactEvent);

    return json(res, 200, {
      ok: true,
      redacted: !admin,
      summary,
      recent
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'analytics.state.unhandled_error',
        error: String(error?.message || error),
        stack: String(error?.stack || '')
      })
    );
    return json(res, 500, { ok: false, error: 'Server error while loading analytics state' });
  }
};

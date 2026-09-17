const { getClientIp, json, methodGuard, readBody, tooManyRequests } = require('./_lib/http');
const { checkRateLimit } = require('./_lib/rate-limit');
const analytics = require('./_lib/analytics-store');
const { normalizeAddress } = require('./_lib/evm');
const { verifyAppOrigin } = require('./_lib/app-origin');

function getRequestId(req) {
  return String(req.headers['x-request-id'] || req.headers['x-vercel-id'] || '').trim() || null;
}

function inferWebhookEvent(req, body) {
  const headerEvent = req.headers['x-event-type'] || req.headers['x-base-event'] || req.headers['x-farcaster-event'];
  return (
    body?.event ||
    body?.type ||
    body?.name ||
    body?.action ||
    headerEvent ||
    'base_webhook'
  );
}

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const origin = verifyAppOrigin(req);
    if (!origin.ok) {
      console.warn(
        JSON.stringify({
          event: 'webhook.forbidden_host',
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

    // Public unauthenticated endpoint: cap how fast one source can write
    // analytics records so it cannot be used to flood storage.
    const rl = await checkRateLimit({
      scope: 'webhook',
      key: getClientIp(req),
      limit: 120,
      windowMs: 60 * 1000
    });
    if (!rl.allowed) return tooManyRequests(res, 'Too many webhook events', rl.retryAfterMs);

    const body = await readBody(req);
    const eventName = analytics.sanitizeEventName(inferWebhookEvent(req, body)) || 'base_webhook';
    const walletAddress = normalizeAddress(
      body?.address ||
      body?.walletAddress ||
      body?.wallet ||
      body?.user?.custodyAddress ||
      req.headers['x-wallet-address']
    );

    const tracked = await analytics.trackEvent({
      source: 'base_webhook',
      event: eventName,
      playerId: body?.playerId || body?.userId || null,
      walletAddress,
      payload: {
        headers: {
          eventType: req.headers['x-event-type'] || null,
          baseEvent: req.headers['x-base-event'] || null,
          farcasterEvent: req.headers['x-farcaster-event'] || null
        },
        body
      },
      userAgent: req.headers['user-agent'],
      requestId: getRequestId(req)
    });

    return json(res, 200, {
      ok: true,
      tracked: Boolean(tracked),
      eventId: tracked?.id || null
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'webhook.unhandled_error',
        error: String(error?.message || error),
        stack: String(error?.stack || '')
      })
    );
    return json(res, 500, { ok: false, error: 'Server error during webhook processing' });
  }
};

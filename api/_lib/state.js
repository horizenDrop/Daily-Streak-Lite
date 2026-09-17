let createClient = null;
try {
  ({ createClient } = require('redis'));
} catch {
  createClient = null;
}

let redisClientPromise = null;

function normalizeRedisUrl(rawValue) {
  if (!rawValue) return '';
  const input = String(rawValue).trim();
  if (
    (input.startsWith('"') && input.endsWith('"')) ||
    (input.startsWith("'") && input.endsWith("'"))
  ) {
    return input.slice(1, -1).trim();
  }
  return input;
}

function buildRedisUrlCandidates(rawValue) {
  const normalized = normalizeRedisUrl(rawValue);
  if (!normalized) return [];

  const candidates = [normalized];
  if (normalized.startsWith('redis://')) {
    candidates.push(`rediss://${normalized.slice('redis://'.length)}`);
  }

  return [...new Set(candidates)];
}

async function connectRedis(candidates) {
  function withTimeout(promise, timeoutMs) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('redis_connect_timeout')), timeoutMs);
      })
    ]);
  }

  let lastError = null;

  for (const url of candidates) {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: () => false
      }
    });
    client.on('error', () => {});
    try {
      await withTimeout(client.connect(), 7000);
      return client;
    } catch (error) {
      lastError = error;
      try {
        client.disconnect();
      } catch {
        // best effort cleanup
      }
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function getRedisClient() {
  if (!createClient) return null;
  const candidates = buildRedisUrlCandidates(process.env.REDIS_URL);
  if (!candidates.length) return null;

  if (!redisClientPromise) {
    redisClientPromise = connectRedis(candidates);
  }

  let client = null;
  try {
    client = await redisClientPromise;
  } catch {
    redisClientPromise = null;
    return null;
  }

  // `reconnectStrategy: () => false` means a dropped socket never heals on its
  // own. Without this check the cached promise would keep handing out a dead
  // client and every store call would silently fall back to memory forever.
  if (client && client.isOpen === false) {
    redisClientPromise = null;
    return null;
  }

  return client;
}

module.exports = {
  getRedisClient
};

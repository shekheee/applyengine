const HEALTH_URL = "https://applyengine-api.onrender.com/api/health";

async function checkHealth() {
  const startedAt = Date.now();
  const response = await fetch(HEALTH_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ApplyEngine-Cloudflare-Keepalive/1.0",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`ApplyEngine health check returned HTTP ${response.status}`);
  }

  return {
    ok: true,
    status: response.status,
    duration_ms: Date.now() - startedAt,
  };
}

export default {
  async scheduled(_controller, _env, context) {
    context.waitUntil(
      checkHealth().then((result) => {
        console.log("ApplyEngine Render keep-alive succeeded", result);
      })
    );
  },
};

// Polls the backend health endpoint until it responds OK or times out.
// Used by init-and-start.bat to verify the API actually came up.
const url = process.env.HEALTH_URL || 'http://localhost:5000/api/health';
const timeoutMs = Number(process.env.HEALTH_TIMEOUT_MS) || 25000;
const deadline = Date.now() + timeoutMs;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll() {
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        console.log(`OK  ${url} -> ${JSON.stringify(body)}`);
        process.exit(0);
      }
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e.code || e.message;
    }
    await sleep(1000);
  }
  console.error(`TIMEOUT after ${Math.round(timeoutMs / 1000)}s waiting for ${url} (last: ${lastErr})`);
  process.exit(1);
}

poll();

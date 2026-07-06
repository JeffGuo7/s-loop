/**
 * fetch-json — cross-platform HTTP JSON fetcher for skills and automation.
 *
 * Usage:
 *   node fetch-json.mjs <url> [headers...]
 *
 * Examples:
 *   node fetch-json.mjs "https://api.example.com/data"
 *   node fetch-json.mjs "https://api.example.com/data" "User-Agent: Mozilla/5.0"
 *   cat body.json | node fetch-json.mjs --post "https://api.example.com/data"
 *
 * Guarantees:
 *   - UTF-8 output regardless of platform encoding
 *   - JSON is pretty-printed and validated
 *   - Error messages go to stderr, data goes to stdout
 *   - Exit code 0 on success, 1 on failure
 *   - Works on Windows / Linux / macOS with zero dependencies
 */

const url = process.argv[2];
const extraHeaders = process.argv.slice(3);

if (!url || url === '--help' || url === '-h') {
  console.log('Usage: node fetch-json.mjs <url> [header=value ...]');
  console.log('       node fetch-json.mjs --post <url>  (reads body from stdin)');
  process.exit(url ? 0 : 1);
}

const isPost = url === '--post';
const target = isPost ? process.argv[3] : url;

if (!target) {
  console.error('Error: URL is required');
  process.exit(1);
}

const headers = { 'Accept': 'application/json' };

for (const h of (isPost ? process.argv.slice(4) : extraHeaders)) {
  const sep = h.includes(':') ? ':' : '=';
  const idx = h.indexOf(sep);
  if (idx > 0) {
    headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
  }
}

async function main() {
  let body = null;
  if (isPost) {
    // Read body from stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    body = Buffer.concat(chunks).toString('utf8');
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(target, {
    method: isPost ? 'POST' : 'GET',
    headers,
    body,
  });

  if (!res.ok) {
    console.error(`Error: HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text);
    // Pretty-print to stdout, always UTF-8
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } catch {
    // Not JSON — output raw text but warn
    console.error('Warning: response is not valid JSON, outputting raw text');
    process.stdout.write(text);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

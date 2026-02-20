#!/usr/bin/env node
/**
 * Test end-to-end del endpoint public-menu (sin PowerShell).
 * Uso: node scripts/test-public-menu.mjs <TOKEN>
 *
 * Env (opcional):
 *   SUPABASE_REF_URL  default https://sejhpjfzznskhmbifrum.supabase.co
 *   SUPABASE_ANON_KEY obligatorio para health y para llamar a la función
 */

const REF_URL = process.env.SUPABASE_REF_URL || 'https://sejhpjfzznskhmbifrum.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const TOKEN = process.argv[2] || '2203ebdc8295fb46db80f17fe3db5f575';

function headers() {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'apikey': ANON_KEY,
    ...(ANON_KEY ? { 'Authorization': `Bearer ${ANON_KEY}` } : {}),
  };
}

async function healthCheck() {
  const url = `${REF_URL}/rest/v1/branches?select=id&limit=1`;
  const res = await fetch(url, { method: 'GET', headers: headers() });
  return { ok: res.ok, status: res.status, url };
}

async function callPublicMenu(token) {
  const url = `${REF_URL}/functions/v1/public-menu?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'GET', headers: headers() });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, url, body };
}

async function main() {
  console.log('Supabase Ref URL:', REF_URL);
  console.log('Token (argv o default):', TOKEN ? `${TOKEN.slice(0, 8)}...` : '(ninguno)');
  console.log('');

  if (!ANON_KEY) {
    console.error('Falta SUPABASE_ANON_KEY. Ejemplo:');
    console.error('  export SUPABASE_ANON_KEY=eyJ...');
    console.error('  node scripts/test-public-menu.mjs', TOKEN || '<TOKEN>');
    process.exit(1);
  }

  console.log('--- 1) Health: REST /rest/v1/branches ---');
  const health = await healthCheck();
  console.log('Status:', health.status, health.ok ? 'OK' : 'FAIL');
  if (!health.ok) {
    console.error('El ref/anon key no corresponden al proyecto o la URL es incorrecta.');
    process.exit(1);
  }
  console.log('');

  console.log('--- 2) GET /functions/v1/public-menu?token=... ---');
  const result = await callPublicMenu(TOKEN);
  console.log('Status:', result.status, result.ok ? 'OK' : 'FAIL');
  console.log('Body:', typeof result.body === 'object' ? JSON.stringify(result.body, null, 2) : result.body);
  console.log('');

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

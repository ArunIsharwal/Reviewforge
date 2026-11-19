import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { MongoClient, ServerApiVersion } from 'mongodb';
import { GoogleGenAI } from '@google/genai';

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let val = line.slice(eqIndex + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).trim();
    }
    result[key] = val;
  }
  return result;
}

const envBase = parseEnvFile(path.resolve('.env'));
const envLocal = parseEnvFile(path.resolve('.env.local'));

// Merge .env first, then .env.local ONLY for non-placeholder values
const merged = { ...envBase };
for (const [k, v] of Object.entries(envLocal)) {
  if (v && !v.includes('REPLACE_')) {
    merged[k] = v;
  }
}

console.log('--- Environment Check (.env vs .env.local) ---');
for (const key of ['MONGODB_URI', 'MONGODB_DB_NAME', 'AUTH_SECRET', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'SEED_ADMIN_EMAIL']) {
  const baseVal = envBase[key];
  const localVal = envLocal[key];
  const baseStatus = !baseVal ? 'MISSING' : baseVal.includes('REPLACE_') ? 'PLACEHOLDER' : `SET(len=${baseVal.length})`;
  const localStatus = !localVal ? 'MISSING' : localVal.includes('REPLACE_') ? 'PLACEHOLDER' : `SET(len=${localVal.length})`;
  console.log(`${key}: .env=${baseStatus} | .env.local=${localStatus}`);
}

// 1. Diagnose DNS & Test MongoDB Atlas
console.log('\n--- Testing MongoDB Atlas Connection ---');
const mongoUri = merged.MONGODB_URI;
const dbName = merged.MONGODB_DB_NAME || 'reviewforge';

if (!mongoUri || mongoUri.includes('REPLACE_')) {
  console.log('❌ MongoDB URI missing or placeholder.');
} else {
  const hostMatch = mongoUri.match(/@([^/?]+)/);
  const host = hostMatch ? hostMatch[1] : null;
  if (host) {
    try {
      const dohRes = await fetch(`https://dns.google/resolve?name=_mongodb._tcp.${encodeURIComponent(host)}&type=SRV`);
      const dohJson = await dohRes.json();
      console.log(`Global DoH SRV lookup for _mongodb._tcp.${host}: Status=${dohJson.Status} (${dohJson.Status === 3 ? 'NXDOMAIN - hostname does not exist in global DNS' : dohJson.Status === 0 && dohJson.Answer ? `FOUND ${dohJson.Answer.length} shards` : 'No SRV records'})`);
    } catch (e) {
      console.log('Global DoH check error:', e.message);
    }

    await new Promise((resolve) => {
      dns.resolveSrv(`_mongodb._tcp.${host}`, (err, addrs) => {
        console.log('OS DNS SRV lookup:', err ? `${err.code}` : `OK (${addrs.length} records)`);
        resolve();
      });
    });
  }

  const client = new MongoClient(mongoUri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    const collections = await db.listCollections().toArray();
    console.log(`✅ MongoDB Atlas connected! Database "${dbName}", collections: ${collections.length}`);
  } catch (err) {
    console.log(`❌ MongoDB connect failed: ${err.message}`);
  } finally {
    await client.close().catch(() => {});
  }
}

// 2. Test Google Gemini API
console.log('\n--- Testing Google Gemini API ---');
const apiKey = merged.GEMINI_API_KEY;
const modelName = merged.GEMINI_MODEL || 'gemini-3.5-flash';

if (!apiKey || apiKey.includes('REPLACE_')) {
  console.log('❌ Gemini API key missing or placeholder.');
} else {
  try {
    const ai = new GoogleGenAI({ apiKey });
    console.log(`Testing model "${modelName}"...`);
    const resp = await ai.models.generateContent({
      model: modelName,
      contents: 'Reply strictly with JSON: {"ok": true}',
      config: { responseMimeType: 'application/json' },
    });
    console.log(`✅ Gemini "${modelName}" responded:`, resp.text);
  } catch (err) {
    console.log(`❌ Gemini "${modelName}" failed: ${err.message || err}`);
  }
}

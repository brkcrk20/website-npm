#!/usr/bin/env node
/**
 * Supabase migration'larını Management API üzerinden uygular.
 *
 * NEDEN VAR: `npx supabase db push` bu ortamda (Claude Code on the web)
 * çalışmıyor — iki ayrı sebepten:
 *
 *   1. CLI 2.115 Bun ile derlenmiş bir ikili ve oturumun çıkış proxy'sini
 *      kullanmıyor; her istek "Transport error" ile düşüyor.
 *   2. CLI çalışsa bile `db push` veritabanına HAM TCP ile bağlanıyor
 *      (db.<ref>.supabase.co:5432). Ortamın proxy'si ham TCP veritabanı
 *      bağlantılarını desteklemiyor.
 *
 * Bu betik ikisini de aşmıyor, üçüncü bir yol kullanıyor: Supabase
 * Management API'sinin SQL uç noktası (Studio'daki SQL Editor'ün kullandığı
 * uç nokta), yani düz HTTPS. Node'un `fetch`'i proxy'yi kullandığı için
 * çalışıyor.
 *
 * AYRICA migration geçmişini de düzeltir. supabase/README.md'nin uyardığı
 * sorun: Studio'dan elle çalıştırılan SQL `supabase_migrations.schema_migrations`
 * tablosuna kayıt DÜŞMEZ, bu yüzden CLI o dosyaları "uygulanmamış" sanır ve
 * bir sonraki `db push` hepsini yeniden çalıştırmayı dener. Bu betik
 * uyguladığı her dosyayı o tabloya yazar; `--mark-applied` ile de geçmişte
 * elle uygulanmış dosyalar SQL çalıştırılmadan uygulanmış olarak işaretlenir.
 *
 * KULLANIM
 *   node scripts/supabase-sql.mjs --list
 *   node scripts/supabase-sql.mjs --mark-applied 20260824000000 20260825000000
 *   node scripts/supabase-sql.mjs --apply-pending --dry-run
 *   node scripts/supabase-sql.mjs --apply-pending --yes
 *
 * ORTAM DEĞİŞKENLERİ
 *   SUPABASE_ACCESS_TOKEN   zorunlu. Personal access token (sbp_...).
 *                           ASLA depoya yazılmaz, argüman olarak da geçilmez
 *                           (argümanlar `ps` çıktısında görünür).
 *   SUPABASE_PROJECT_REF    isteğe bağlı. Verilmezse hesaptaki projeler
 *                           listelenir ve tek proje varsa o seçilir; birden
 *                           fazlaysa betik durur ve ref ister.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const API = 'https://api.supabase.com';
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../supabase/migrations'
);

/**
 * Token nereden okunur (sırayla):
 *   1. SUPABASE_ACCESS_TOKEN ortam değişkeni
 *   2. SUPABASE_TOKEN_FILE ile gösterilen dosya
 *   3. ~/.config/swaloop/supabase-token
 *
 * Token ASLA argüman olarak alınmaz: komut satırı argümanları `ps` çıktısında
 * ve kabuk geçmişinde görünür. Dosya yolu bilinçli olarak DEPONUN DIŞINDA —
 * depo içinde tutulan bir sır er ya da geç commit'lenir.
 */
function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();

  const file =
    process.env.SUPABASE_TOKEN_FILE ||
    path.join(os.homedir(), '.config', 'swaloop', 'supabase-token');

  try {
    return fs.readFileSync(file, 'utf-8').trim();
  } catch {
    return null;
  }
}

const token = readToken();

if (!token) {
  console.error(
    'HATA: Supabase access token bulunamadı.\n' +
      'Şunlardan biri olmalı:\n' +
      '  · SUPABASE_ACCESS_TOKEN ortam değişkeni\n' +
      '  · SUPABASE_TOKEN_FILE ile gösterilen dosya\n' +
      '  · ~/.config/swaloop/supabase-token\n' +
      'Token\'ı komut satırına YAZMAYIN (ps çıktısına ve kabuk geçmişine düşer).'
  );
  process.exit(1);
}

/** Management API çağrısı. Hata gövdesini olduğu gibi yüzeye çıkarır. */
async function api(method, endpoint, body) {
  const response = await fetch(API + endpoint, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${method} ${endpoint} → HTTP ${response.status}: ${text.slice(0, 600)}`);
  }

  return text ? JSON.parse(text) : null;
}

/** Projede SQL çalıştırır (Studio'nun SQL Editor'ü ile aynı uç nokta). */
async function runSql(ref, query) {
  return api('POST', `/v1/projects/${ref}/database/query`, { query });
}

async function resolveProjectRef() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF;

  const projects = await api('GET', '/v1/projects');

  if (!projects.length) throw new Error('Bu hesapta hiç proje yok.');

  if (projects.length > 1) {
    const list = projects.map((p) => `  ${p.id}  ${p.name}`).join('\n');
    throw new Error(
      `Hesapta ${projects.length} proje var; hangisi olduğunu SUPABASE_PROJECT_REF ile verin:\n${list}`
    );
  }

  console.log(`Proje: ${projects[0].name} (${projects[0].id})`);
  return projects[0].id;
}

/** Yerel migration dosyaları, sürüm (dosya adının başındaki damga) sırasına göre. */
function localMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({
      version: file.split('_')[0],
      name: file.replace(/^\d+_/, '').replace(/\.sql$/, ''),
      file,
      fullPath: path.join(MIGRATIONS_DIR, file),
    }));
}

/** Uzaktaki geçmiş tablosu. Tablo hiç yoksa boş liste döner. */
async function remoteVersions(ref) {
  const rows = await runSql(
    ref,
    `select version from supabase_migrations.schema_migrations order by version`
  ).catch((error) => {
    if (/schema_migrations|does not exist/i.test(error.message)) return [];
    throw error;
  });

  return new Set((rows ?? []).map((r) => r.version));
}

/** Geçmiş tablosunu (yoksa) oluşturur — CLI ile aynı şema. */
async function ensureHistoryTable(ref) {
  await runSql(
    ref,
    `create schema if not exists supabase_migrations;
     create table if not exists supabase_migrations.schema_migrations (
       version text primary key,
       statements text[],
       name text
     );`
  );
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function markApplied(ref, migration) {
  await runSql(
    ref,
    `insert into supabase_migrations.schema_migrations (version, name)
     values (${sqlLiteral(migration.version)}, ${sqlLiteral(migration.name)})
     on conflict (version) do nothing;`
  );
}

// ── Argümanlar ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valuesAfter = (flag) => {
  const start = args.indexOf(flag);
  if (start === -1) return [];
  return args.slice(start + 1).filter((a) => !a.startsWith('--'));
};

const ref = await resolveProjectRef();
await ensureHistoryTable(ref);

const applied = await remoteVersions(ref);
const migrations = localMigrations();

if (has('--list') || args.length === 0) {
  console.log('\n  DURUM  SÜRÜM           DOSYA');
  for (const m of migrations) {
    console.log(`  ${applied.has(m.version) ? '  ✓  ' : '  —  '}  ${m.version}  ${m.file}`);
  }
  const pending = migrations.filter((m) => !applied.has(m.version));
  console.log(`\n  ${applied.size} uygulanmış, ${pending.length} bekliyor.\n`);
  process.exit(0);
}

if (has('--mark-applied')) {
  const wanted = valuesAfter('--mark-applied');
  const targets = migrations.filter((m) => wanted.includes(m.version));

  if (targets.length !== wanted.length) {
    const missing = wanted.filter((w) => !targets.some((t) => t.version === w));
    throw new Error(`Şu sürümler yerelde yok: ${missing.join(', ')}`);
  }

  for (const m of targets) {
    await markApplied(ref, m);
    console.log(`  ✓ işaretlendi (SQL ÇALIŞTIRILMADI): ${m.file}`);
  }
  process.exit(0);
}

if (has('--apply-pending') || has('--apply')) {
  const wanted = has('--apply') ? valuesAfter('--apply') : null;
  const targets = migrations.filter(
    (m) => !applied.has(m.version) && (!wanted || wanted.includes(m.version))
  );

  if (!targets.length) {
    console.log('Bekleyen migration yok.');
    process.exit(0);
  }

  console.log(`\nUygulanacak (${targets.length}):`);
  for (const m of targets) {
    const lines = fs.readFileSync(m.fullPath, 'utf-8').split('\n').length;
    console.log(`  ${m.file}  (${lines} satır)`);
  }

  if (has('--dry-run')) {
    console.log('\n--dry-run: hiçbir şey çalıştırılmadı.\n');
    process.exit(0);
  }

  if (!has('--yes')) {
    console.log('\nOnay için --yes ekleyin. Hiçbir şey çalıştırılmadı.\n');
    process.exit(1);
  }

  for (const m of targets) {
    const sql = fs.readFileSync(m.fullPath, 'utf-8');
    process.stdout.write(`\n▶ ${m.file} … `);

    // Tek işlem: dosyanın herhangi bir yerinde hata olursa tamamı geri alınır.
    // Migration'lar geriye dönük veri düzeltmesi de yaptığı için yarım
    // uygulanmış bir dosya en kötü sonuç olurdu.
    await runSql(ref, `begin;\n${sql}\ncommit;`);

    await markApplied(ref, m);
    console.log('tamam');
  }

  console.log('\n✅ Bekleyen migration kalmadı.\n');
  process.exit(0);
}

console.error('Bilinmeyen argüman. Kullanım için dosyanın başındaki açıklamaya bakın.');
process.exit(1);

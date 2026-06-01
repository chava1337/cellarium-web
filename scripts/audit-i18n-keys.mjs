#!/usr/bin/env node
/**
 * Auditoría i18n Cellarium (solo lectura).
 * Detecta: keys usadas en código, keys faltantes en pt-BR, strings hardcodeados sospechosos.
 *
 * Uso: node scripts/audit-i18n-keys.mjs
 * Salida: scripts/reports/i18n-audit.json + resumen en consola
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const LC_FILE = path.join(SRC, 'contexts', 'LanguageContext.tsx');
const PT_P1_FILE = path.join(SRC, 'i18n', 'ptBRP1Screens.ts');
const INV_TASTING_FILE = path.join(SRC, 'i18n', 'inventoryTastingI18n.ts');
const EXTENDED_FILE = path.join(SRC, 'i18n', 'cellariumExtendedI18n.ts');
const TASTING_FLOW_FILE = path.join(SRC, 'i18n', 'tastingFlowI18n.ts');
const AUTH_FLOW_FILE = path.join(SRC, 'i18n', 'authFlowI18n.ts');

function extractFromExportFile(filePath, exportName) {
  if (!fs.existsSync(filePath)) return new Set();
  const raw = fs.readFileSync(filePath, 'utf8');
  const section = raw.match(new RegExp(`export const ${exportName}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`, 'm'))?.[1] ?? '';
  return extractLocaleKeys(section);
}
const OUT_DIR = path.join(__dirname, 'reports');
const OUT_JSON = path.join(OUT_DIR, 'i18n-audit.json');

const SCAN_EXT = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'scripts/reports']);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (SKIP_DIRS.has(name)) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (SCAN_EXT.has(path.extname(name))) files.push(full);
  }
  return files;
}

function extractLocaleKeys(block) {
  const keys = new Set();
  const re = /'([a-z][a-z0-9_.-]*)':/gi;
  let m;
  while ((m = re.exec(block))) keys.add(m[1]);
  return keys;
}

function parseTranslations() {
  const raw = fs.readFileSync(LC_FILE, 'utf8');
  const esBlock = raw.match(/^\s*es:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*en:/m)?.[1] ?? '';
  const enBlock = raw.match(/^\s*en:\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\/\*\* UI pt-BR/m)?.[1] ?? '';
  const ptBlock = raw.match(/'pt-BR':\s*\{([\s\S]*?)\n\s*\},/m)?.[1] ?? '';
  const ptInline = extractLocaleKeys(ptBlock);
  let ptP1 = new Set();
  let invEs = new Set();
  let invEn = new Set();
  if (fs.existsSync(PT_P1_FILE)) {
    ptP1 = extractLocaleKeys(fs.readFileSync(PT_P1_FILE, 'utf8'));
  }
  if (fs.existsSync(INV_TASTING_FILE)) {
    invEs = extractFromExportFile(INV_TASTING_FILE, 'inventoryTastingEs');
    invEn = extractFromExportFile(INV_TASTING_FILE, 'inventoryTastingEn');
    ptP1 = new Set([...ptP1, ...extractFromExportFile(INV_TASTING_FILE, 'inventoryTastingPtBR')]);
  }
  if (fs.existsSync(EXTENDED_FILE)) {
    invEs = new Set([...invEs, ...extractFromExportFile(EXTENDED_FILE, 'cellariumExtendedEs')]);
    invEn = new Set([...invEn, ...extractFromExportFile(EXTENDED_FILE, 'cellariumExtendedEn')]);
    ptP1 = new Set([...ptP1, ...extractFromExportFile(EXTENDED_FILE, 'cellariumExtendedPtBR')]);
  }
  if (fs.existsSync(TASTING_FLOW_FILE)) {
    invEs = new Set([...invEs, ...extractFromExportFile(TASTING_FLOW_FILE, 'tastingFlowEs')]);
    invEn = new Set([...invEn, ...extractFromExportFile(TASTING_FLOW_FILE, 'tastingFlowEn')]);
    ptP1 = new Set([...ptP1, ...extractFromExportFile(TASTING_FLOW_FILE, 'tastingFlowPtBR')]);
  }
  if (fs.existsSync(AUTH_FLOW_FILE)) {
    invEs = new Set([...invEs, ...extractFromExportFile(AUTH_FLOW_FILE, 'authFlowEs')]);
    invEn = new Set([...invEn, ...extractFromExportFile(AUTH_FLOW_FILE, 'authFlowEn')]);
    ptP1 = new Set([...ptP1, ...extractFromExportFile(AUTH_FLOW_FILE, 'authFlowPtBR')]);
  }
  const pt = new Set([...ptInline, ...ptP1]);
  return {
    es: new Set([...extractLocaleKeys(esBlock), ...invEs]),
    en: new Set([...extractLocaleKeys(enBlock), ...invEn]),
    pt,
  };
}

const T_CALL =
  /\bt\s*\(\s*['"`]([a-z][a-z0-9_.-]*)['"`]/gi;
const HARDCODED_TEXT =
  /<Text[^>]*>\s*([^<{][^<]{2,120}?)\s*<\/Text>/g;
const ALERT_STRING =
  /Alert\.alert\s*\(\s*['"`]([^'"`]+)['"`]/g;

function scanSourceFiles(locales) {
  const usedKeys = new Map();
  const hardcoded = [];
  const alertStrings = [];

  for (const file of walk(SRC)) {
    if (file.includes('LanguageContext.tsx')) continue;
    const rel = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');

    let m;
    T_CALL.lastIndex = 0;
    while ((m = T_CALL.exec(content))) {
      const key = m[1];
      if (!usedKeys.has(key)) usedKeys.set(key, []);
      usedKeys.get(key).push(rel);
    }

    HARDCODED_TEXT.lastIndex = 0;
    while ((m = HARDCODED_TEXT.exec(content))) {
      const text = m[1].trim();
      if (!text || text.startsWith('{') || text.startsWith('$')) continue;
      if (/^[\d\s%$.,:;!?+-]+$/.test(text)) continue;
      if (text.length < 3) continue;
      hardcoded.push({ file: rel, text: text.slice(0, 120) });
    }

    ALERT_STRING.lastIndex = 0;
    while ((m = ALERT_STRING.exec(content))) {
      alertStrings.push({ file: rel, text: m[1] });
    }
  }

  const usedList = [...usedKeys.keys()].sort();
  const missingPt = usedList.filter((k) => !locales.pt.has(k));
  const missingEn = usedList.filter((k) => !locales.es.has(k) && !locales.en.has(k));
  const ptOnly = [...locales.pt].filter((k) => !locales.es.has(k));

  return {
    usedKeys: usedList,
    usedKeyCount: usedList.length,
    missingPtBR: missingPt,
    missingPtBRCount: missingPt.length,
    missingInEsEn: missingEn,
    orphanPtKeys: ptOnly,
    hardcodedSamples: hardcoded.slice(0, 200),
    hardcodedCount: hardcoded.length,
    alertHardcoded: alertStrings,
    topMissingPtP0: missingPt.filter((k) =>
      /^(admin|catalog|global_catalog|wine|btn|msg|settings|nav|common)\./.test(k)
    ),
  };
}

function main() {
  const locales = parseTranslations();
  const report = {
    generatedAt: new Date().toISOString(),
    localeKeyCounts: {
      es: locales.es.size,
      en: locales.en.size,
      ptBR: locales.pt.size,
    },
    ...scanSourceFiles(locales),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  console.log('=== Cellarium i18n audit ===');
  console.log(`Keys: es=${report.localeKeyCounts.es} en=${report.localeKeyCounts.en} pt-BR=${report.localeKeyCounts.ptBR}`);
  console.log(`Used in src: ${report.usedKeyCount}`);
  console.log(`Missing pt-BR (used in app): ${report.missingPtBRCount}`);
  console.log(`Missing pt-BR P0 prefix: ${report.topMissingPtP0.length}`);
  console.log(`Hardcoded <Text> samples: ${report.hardcodedCount}`);
  console.log(`Alert() literal strings: ${report.alertHardcoded.length}`);
  console.log(`Report: ${OUT_JSON}`);
  if (report.topMissingPtP0.length > 0) {
    console.log('\nP0 missing pt-BR (first 25):');
    console.log(report.topMissingPtP0.slice(0, 25).join('\n'));
  }
}

main();

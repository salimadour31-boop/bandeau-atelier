import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outShot = path.join(root, 'screenshots', 'demo.png');
const url = process.env.BA_URL || 'http://127.0.0.1:8765/';

// Use puppeteer-core if available, else drive chrome via CDP with a tiny helper
async function main() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer-core');
  } catch {
    try {
      puppeteer = await import('puppeteer');
    } catch {
      puppeteer = null;
    }
  }

  const chromePath = process.env.CHROME_PATH ||
    ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
      .find((p) => fs.existsSync(p));

  if (!puppeteer || !chromePath) {
    console.error('No puppeteer/chrome');
    process.exit(2);
  }

  const browser = await puppeteer.default.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const errors = [];
  async function check(width, height, label) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${label}] console.error: ${msg.text()}`);
    });
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#preview');
    // wait fonts + first paint
    await page.waitForTimeout?.(800) || await new Promise((r) => setTimeout(r, 800));
    // force hold pose for clean screenshot
    await page.click('#btnHold');
    await new Promise((r) => setTimeout(r, 300));
    const hasCanvas = await page.$eval('#preview', (c) => c.width > 0 && c.height > 0);
    if (!hasCanvas) errors.push(`[${label}] canvas has zero size`);
    if (label === 'desktop') {
      await page.screenshot({ path: outShot, fullPage: false });
      // also export canvas PNG as alternate if needed
      const data = await page.$eval('#preview', (c) => c.toDataURL('image/png'));
      const buf = Buffer.from(data.split(',')[1], 'base64');
      // Prefer canvas content for demo (cleaner). Overlay UI screenshot already saved;
      // replace with a composite: screenshot of the screen area
      const el = await page.$('.preview-panel');
      if (el) await el.screenshot({ path: outShot });
      console.log('screenshot bytes', fs.statSync(outShot).size, 'canvas', buf.length);
    }
    await page.close();
    console.log('ok', label, width + 'x' + height);
  }

  try {
    await check(1280, 800, 'desktop');
    await check(375, 812, 'mobile');
  } finally {
    await browser.close();
  }

  if (errors.length) {
    console.error('ERRORS:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('SMOKE PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });

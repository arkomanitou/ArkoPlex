// Optional browser check: uses an existing Playwright install, not an app dependency.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        args: ['--no-sandbox'],
    });
    const findings = [];
    try {
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
            const context = await browser.newContext({ viewport, locale: 'fr-FR' });
            const page = await context.newPage();
            const errors = [];
            const blocked = [];
            const responses = [];
            page.on('pageerror', (error) => errors.push(error.message));
            page.on('response', (response) => {
                if (response.status() >= 400) responses.push({ url: response.url(), status: response.status() });
            });
            await context.route('**/*', (route) => {
                const url = new URL(route.request().url());
                if (url.origin === new URL(process.argv[2]).origin || ['data:', 'blob:'].includes(url.protocol)) {
                    return route.continue();
                }
                blocked.push(url.origin);
                return route.abort();
            });
            await page.goto(process.argv[2] + '/', { waitUntil: 'networkidle' });
            await page.waitForURL('**/login');
            await page.locator('#server-address').waitFor({ state: 'visible' });
            const metrics = await page.evaluate(() => ({
                width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
                rootHasContent: document.getElementById('root').children.length > 0,
                title: document.title,
            }));
            assert.equal(errors.length, 0, `JavaScript errors: ${errors.join('; ')}`);
            assert.equal(responses.length, 0, `HTTP errors: ${JSON.stringify(responses)}`);
            assert.equal(blocked.length, 0, `External requests attempted: ${blocked.join('; ')}`);
            assert.equal(metrics.rootHasContent, true);
            assert.ok(metrics.scrollWidth <= metrics.width, 'Horizontal overflow');
            await page.screenshot({ path: `.baseline/login-${viewport.width}.png`, fullPage: true });
            findings.push({ viewport, metrics, errors, responses, blocked, status: 'PASS' });
            console.log(`PASS Chromium login ${viewport.width}x${viewport.height}`);
            await context.close();
        }
        fs.writeFileSync('.baseline/browser-results.json', JSON.stringify(findings, null, 2) + '\n');
    } finally {
        await browser.close();
    }
})().catch((error) => { console.error(error); process.exitCode = 1; });

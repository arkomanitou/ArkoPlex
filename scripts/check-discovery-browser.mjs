import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Browser binaries are installed only in the isolated CI job. No homelab access.
const require = createRequire(process.env.ARKOPLEX_BROWSER_PACKAGE + '/package.json');
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const frontend = createRequire(root + 'frontend/package.json');
const vite = fileURLToPath(new URL('../../bin/vite.js', 'file://' + frontend.resolve('vite')));
const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { cwd: root + 'frontend', stdio: 'ignore' });
const checks = [];
const check = (label, condition) => { assert(condition, label); checks.push(label); console.log('PASS ' + label); };
let browser;
try {
    const origin = 'http://127.0.0.1:4173';
    for (let tries = 0; ; tries++) {
        try { if ((await fetch(origin)).ok) break; } catch { /* Wait for preview server only. */ }
        if (tries > 80) throw new Error('Preview server did not start');
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
        if (!localStorage.getItem('jf_user')) localStorage.setItem('jf_user', 'alice');
        localStorage.setItem('jf_server', 'https://jellyfin.invalid');
        localStorage.setItem('jf_token', 'fixture-token');
        localStorage.setItem('i18nextLng', 'fr');
        localStorage.setItem('seerrAutoLoginDisabled:https://jellyfin.invalid', 'true');
    });
    const movie = (id, title, status = 1) => ({ id, title, mediaType: 'movie', posterPath: '/fixture.jpg', mediaInfo: { status } });
    let requested = false;
    const requests = [];
    const escapedCalls = [];
    const errors = [];
    let outage = false;
    let connected = true;
    const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#123a4f"/><stop offset="1" stop-color="#887132"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/><circle cx="240" cy="215" r="105" fill="#d5c485" opacity=".35"/><path d="M0 420L260 210L400 420V600H0Z" fill="#08111e"/></svg>`;
    await context.route('**/*', async route => {
        const req = route.request();
        const u = new URL(req.url());
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }, body: JSON.stringify(data) });
        if (u.hostname === 'image.tmdb.org') return route.fulfill({ contentType: 'image/svg+xml', body: artwork });
        if (u.hostname === 'jellyfin.invalid') {
            if (u.pathname.endsWith('/Users/Me')) {
                const user = await req.frame().evaluate(() => localStorage.getItem('jf_user'));
                return json({ Id: user, Name: user === 'alice' ? 'Alice' : 'Bob', Policy: { IsAdministrator: false } });
            }
            if (u.pathname.endsWith('/Items')) {
                const user = u.searchParams.get('userId') || u.searchParams.get('UserId');
                const favorite = [...u.searchParams].some(([key, value]) => key.toLowerCase() === 'isfavorite' && value === 'true');
                return json({ Items: favorite ? [{ Id: 'seed', Name: user === 'bob' ? 'Favori Bob' : 'Favori Alice', Type: 'Movie', ProviderIds: { Tmdb: user === 'bob' ? '2' : '1' } }] : [], TotalRecordCount: favorite ? 1 : 0 });
            }
            if (req.method() !== 'GET') return route.fulfill({ status: 204 });
            return json({ Items: [], TotalRecordCount: 0 });
        }
        if (u.origin !== origin) { escapedCalls.push(req.url()); return route.abort(); }
        if (!u.pathname.startsWith('/api/')) return route.continue();
        if (u.pathname === '/api/arkoplex/config') return json({ serverName: 'ArkoPlex', seerrUrl: 'https://seerr.invalid', nightPulseEnabled: true, homeScreenSections: [{ type: 'seerrDiscover', enabled: true }] });
        if (u.pathname === '/api/seerr/status') return json({ loggedIn: connected });
        if (u.pathname === '/api/seerr/discover/trending' || u.pathname === '/api/seerr/discover/movies' || u.pathname === '/api/seerr/discover/tv') {
            if (outage) return json({}, 503);
            const page = Number(u.searchParams.get('page') || '1');
            return json({ page, totalPages: 2, results: page === 2 ? [movie(901, 'Autre horizon')] : [movie(900, 'Le prochain voyage'), movie(999, 'Déjà disponible', 5), { id: 1001, mediaType: 'tv', name: 'Les mondes cachés', posterPath: '/fixture.jpg', mediaInfo: { status: requested ? 2 : 1 } }] });
        }
        const recommendation = u.pathname.match(/\/movie\/(\d+)\/recommendations$/);
        if (recommendation) return json({ results: Number(recommendation[1]) === 1 ? [movie(101, 'La piste d’Alice')] : [movie(102, 'La piste de Bob')] });
        if (u.pathname === '/api/seerr/request') { requests.push(req.postDataJSON()); requested = true; return json({ id: 21 }, 201); }
        if (u.pathname === '/api/seerr/requests') return json({ results: requested ? [{ id: 21, status: 1, createdAt: '2026-11-10', is4k: false, seasons: [{ seasonNumber: 2 }], media: { tmdbId: 1001, mediaType: 'tv', status: 2 } }] : [], total: requested ? 1 : 0, skip: 0, take: 20 });
        const details = u.pathname.match(/\/seerr\/(movie|tv)\/(\d+)$/);
        if (details) {
            const [, type, rawId] = details;
            const id = Number(rawId);
            if (type === 'tv') return json({ id, name: 'Les mondes cachés', posterPath: '/fixture.jpg', overview: 'Une nouvelle série à découvrir.', seasons: [{ seasonNumber: 1, episodeCount: 8 }, { seasonNumber: 2, episodeCount: 8 }], mediaInfo: { status: requested ? 2 : 1, requests: requested ? [{ id: 21, status: 1, seasons: [{ seasonNumber: 2 }] }] : [] } });
            return json({ ...movie(id, id === 101 ? 'La piste d’Alice' : id === 102 ? 'La piste de Bob' : 'Le prochain voyage'), backdropPath: '/backdrop.jpg', overview: 'Une découverte pour votre prochaine soirée.' });
        }
        return json({});
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/discover');
    await page.getByRole('heading', { name: 'La piste d’Alice', exact: true }).first().waitFor();
    check('Personnalisation Alice chargée depuis son favori', (await page.locator('main').innerText()).includes('Favori Alice'));
    check('Les titres disponibles sont absents des découvertes', await page.getByRole('heading', { name: 'Déjà disponible' }).count() === 0);
    check('Onglet dédié actif', await page.getByRole('link', { name: 'À découvrir', exact: true }).getAttribute('aria-current') === 'page');
    await mkdir(root + 'browser-artifacts', { recursive: true });
    await page.screenshot({ path: root + 'browser-artifacts/discovery-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Ouvrir la fiche de Les mondes cachés', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Les mondes cachés' }).first().waitFor();
    await dialog.getByRole('switch').first().click();
    await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === '/api/seerr/request'), dialog.getByRole('button', { name: /Demander|Request/ }).click()]);
    check('Une demande réelle est remplacée par une fixture et ne contient que la saison choisie', requests.length === 1 && requests[0].mediaId === 1001 && JSON.stringify(requests[0].seasons) === '[2]');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Mes demandes', exact: true }).click();
    await page.getByRole('heading', { name: 'Les mondes cachés', exact: true }).waitFor();
    check('Le suivi présente la demande en attente', (await page.locator('main').innerText()).includes('En attente de validation'));
    await page.getByRole('button', { name: 'Tout', exact: true }).click();
    for (const width of [1024, 736, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForTimeout(100);
        check(`Aucun débordement horizontal à ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.screenshot({ path: root + 'browser-artifacts/discovery-mobile.png', fullPage: true });
    await page.evaluate(() => localStorage.setItem('jf_user', 'bob'));
    await page.reload();
    await page.getByRole('heading', { name: 'La piste de Bob', exact: true }).first().waitFor();
    check('Le compte Bob reçoit une autre sélection', !(await page.locator('main').innerText()).includes('La piste d’Alice'));
    await page.getByRole('link', { name: 'Accueil', exact: true }).click();
    await page.waitForURL(origin + '/');
    await page.getByRole('heading', { name: 'Et si on regardait autre chose ?' }).waitFor({ state: 'hidden' });
    check('Les découvertes externes ne sont pas injectées dans l’accueil', !(await page.locator('main').innerText()).includes('Le prochain voyage'));
    outage = true;
    await page.goto(origin + '/discover?vue=movies');
    await page.getByText('Impossible de charger les découvertes pour le moment.').waitFor();
    check('Une panne présente une erreur et une action de reprise', await page.getByRole('button', { name: 'Réessayer', exact: true }).count() === 1);
    connected = false;
    await page.reload();
    await page.getByRole('button', { name: 'Se connecter à Jellyseerr', exact: true }).waitFor();
    check('Une session Jellyseerr absente affiche la connexion', true);
    check('Aucune exception JavaScript', errors.length === 0);
    check('Aucun service externe réel contacté', escapedCalls.length === 0);
    await readFile(root + 'browser-artifacts/discovery-desktop.png');
} finally {
    await browser?.close();
    server.kill();
}
console.log(`${checks.length} browser checks passed with isolated fixtures.`);

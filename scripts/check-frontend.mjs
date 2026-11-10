import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('../frontend', import.meta.url));
const require = createRequire(frontend + '/package.json');
const { createServer } = await import(require.resolve('vite'));
const values = new Map([
    ['jf_server', 'https://jellyfin.invalid'],
    ['jf_user', 'qa-user'],
    ['jf_token', 'qa-token'],
]);
globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
};
const vite = await createServer({
    root: frontend,
    server: { middlewareMode: true },
    appType: 'custom',
});
try {
    for (const module of ['/tests/nightpulse.ssr.tsx', '/tests/discovery.ssr.tsx', '/tests/playback.ssr.tsx']) {
        const { runChecks } = await vite.ssrLoadModule(module);
        const results = await runChecks();
        for (const name of results) console.log('PASS ' + name);
    }
} finally {
    await vite.close();
}

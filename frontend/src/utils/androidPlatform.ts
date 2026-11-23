import { Capacitor } from '@capacitor/core';
import { selectVideoPlayer } from './selectVideoPlayer';

/** Both conditions are required: a web build never selects the native player. */
export const isAndroidApp =
    selectVideoPlayer(import.meta.env.MODE, Capacitor.getPlatform()) === 'libvlc';

export function initializeAndroid() {
    if (!isAndroidApp) return;
    // Existing SDK errors can contain request headers. Never send them to logcat.
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        console[method] = () => {};
    }
    const networkFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = new URL(
            input instanceof Request ? input.url : String(input),
            window.location.href
        );
        // This APK has no Go backend. Do not silently send passwords to a web proxy.
        if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
            return Promise.resolve(
                new Response(JSON.stringify({ error: 'Service web indisponible dans cette APK' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' },
                })
            );
        }
        return networkFetch(input, init);
    };
}

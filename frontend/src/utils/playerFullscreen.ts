import { isDesktopApp } from './desktopApp';

type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => void;
};

type FullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => void;
};

export function playerIsFullscreen(): boolean {
    const doc = document as FullscreenDocument;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export function enterPlayerFullscreen(): void {
    if (isDesktopApp() || playerIsFullscreen()) return;
    // The document survives loading states and episode route changes.
    const root = document.documentElement as FullscreenElement;
    try {
        if (root.requestFullscreen) {
            void root.requestFullscreen().catch(() => {
                // The explicit fullscreen button remains available if a browser refuses.
            });
        } else {
            root.webkitRequestFullscreen?.();
        }
    } catch {
        // Some embedded browsers expose the API but do not allow its use.
    }
}

export function exitPlayerFullscreen(): void {
    const doc = document as FullscreenDocument;
    if (!playerIsFullscreen()) return;
    if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
}

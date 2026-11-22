import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { BASE_PATH } from '@pelagica/core';
import { enterPlayerFullscreen, exitPlayerFullscreen } from '@/utils/playerFullscreen';

export function PlayerFullscreen() {
    const { pathname } = useLocation();

    useEffect(() => {
        const enterFromLink = (event: MouseEvent) => {
            if (
                event.button !== 0 ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                event.altKey
            )
                return;
            const link =
                event.target instanceof Element
                    ? event.target.closest<HTMLAnchorElement>('a[href]')
                    : null;
            if (!link || link.download || (link.target && link.target !== '_self')) return;
            const url = new URL(link.href, location.href);
            if (
                url.origin === location.origin &&
                url.pathname.startsWith(`${BASE_PATH}/play/`) &&
                !location.pathname.startsWith(`${BASE_PATH}/play/`)
            ) {
                enterPlayerFullscreen();
            }
        };
        document.addEventListener('click', enterFromLink, true);
        return () => document.removeEventListener('click', enterFromLink, true);
    }, []);

    useEffect(() => {
        if (!pathname.startsWith('/play/')) exitPlayerFullscreen();
    }, [pathname]);

    return null;
}

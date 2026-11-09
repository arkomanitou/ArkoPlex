import { useEffect } from 'react';
import { useConfig } from '@pelagica/core';
import { isDesktopBuild } from '@/utils/desktopApp';

export function ArkoAppearance() {
    const { config } = useConfig();
    const enabled = !isDesktopBuild && config.nightPulseEnabled !== false;
    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('arkoplex', enabled);
        root.dataset.arkoMotion = config.nightPulseMotion === 'off' ? 'off' : 'system';
        return () => {
            root.classList.remove('arkoplex');
            delete root.dataset.arkoMotion;
        };
    }, [enabled, config.nightPulseMotion]);
    return null;
}

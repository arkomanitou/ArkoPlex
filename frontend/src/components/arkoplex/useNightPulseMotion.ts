import { useSyncExternalStore } from 'react';
import { getPlatform, useConfig } from '@pelagica/core';

const query = '(prefers-reduced-motion: reduce)';
const subscribe = (callback: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', callback);
    return () => media.removeEventListener('change', callback);
};
const snapshot = () => window.matchMedia(query).matches;

export function useNightPulseMotion() {
    const reduced = useSyncExternalStore(subscribe, snapshot, () => true);
    const { config } = useConfig();
    return (
        getPlatform() === 'web' &&
        config.nightPulseEnabled !== false &&
        config.nightPulseMotion !== 'off' &&
        !reduced
    );
}

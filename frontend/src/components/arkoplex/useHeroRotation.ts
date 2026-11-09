import { useEffect, useState, useSyncExternalStore } from 'react';
import { useNightPulseMotion } from './useNightPulseMotion';
import { canRotateHero, scheduleHeroRotation } from './heroRotation';

const subscribeVisibility = (callback: () => void) => {
    document.addEventListener('visibilitychange', callback);
    return () => document.removeEventListener('visibilitychange', callback);
};
const getVisibility = () => document.visibilityState === 'visible';

export function useHeroRotation(itemCount: number, selectionKey: string) {
    const motionAllowed = useNightPulseMotion();
    const pageVisible = useSyncExternalStore(subscribeVisibility, getVisibility, () => false);
    const [selected, setSelected] = useState(0);
    const [paused, setPaused] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [manualSelection, setManualSelection] = useState(0);
    const index = itemCount ? selected % itemCount : 0;
    const running = canRotateHero({
        itemCount,
        motionAllowed,
        pageVisible,
        paused,
        hovered,
        focused,
    });

    useEffect(
        () =>
            scheduleHeroRotation(
                { itemCount, motionAllowed, pageVisible, paused, hovered, focused },
                () => setSelected((current) => (current + 1) % itemCount)
            ),
        [
            itemCount,
            selectionKey,
            selected,
            manualSelection,
            motionAllowed,
            pageVisible,
            paused,
            hovered,
            focused,
        ]
    );

    function select(next: number) {
        setSelected(next);
        setManualSelection((current) => current + 1);
    }

    function togglePaused() {
        setPaused((current) => !current);
        // An explicit resume can restart while its own control still has keyboard focus.
        setFocused(false);
    }

    return {
        index,
        select,
        paused,
        togglePaused,
        motionAllowed,
        running,
        setHovered,
        setFocused,
    };
}

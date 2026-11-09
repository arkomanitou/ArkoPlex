export const HERO_ROTATION_DELAY = 8_000;

export interface HeroRotationConditions {
    itemCount: number;
    motionAllowed: boolean;
    paused: boolean;
    hovered: boolean;
    focused: boolean;
    pageVisible: boolean;
}

export function canRotateHero(conditions: HeroRotationConditions) {
    return (
        conditions.itemCount > 1 &&
        conditions.motionAllowed &&
        !conditions.paused &&
        !conditions.hovered &&
        !conditions.focused &&
        conditions.pageVisible
    );
}

export function scheduleHeroRotation(
    conditions: HeroRotationConditions,
    advance: () => void,
    clock: Pick<Window, 'setTimeout' | 'clearTimeout'> = window
) {
    if (!canRotateHero(conditions)) return () => {};
    const timer = clock.setTimeout(advance, HERO_ROTATION_DELAY);
    return () => clock.clearTimeout(timer);
}

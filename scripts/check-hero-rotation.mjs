import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    HERO_ROTATION_DELAY,
    scheduleHeroRotation,
} from '../frontend/src/components/arkoplex/heroRotation.ts';

const conditions = {
    itemCount: 3,
    motionAllowed: true,
    paused: false,
    hovered: false,
    focused: false,
    pageVisible: true,
};

function fakeClock() {
    let now = 0;
    let nextId = 0;
    const pending = new Map();
    return {
        setTimeout(callback, delay) {
            const id = ++nextId;
            pending.set(id, { callback, at: now + delay });
            return id;
        },
        clearTimeout(id) {
            pending.delete(id);
        },
        tick(milliseconds) {
            now += milliseconds;
            for (const [id, timer] of pending) {
                if (timer.at <= now) {
                    pending.delete(id);
                    timer.callback();
                }
            }
        },
        get pendingCount() {
            return pending.size;
        },
    };
}

test('La rotation attend huit secondes et ne déclenche aucun intervalle permanent', () => {
    const clock = fakeClock();
    let advances = 0;
    scheduleHeroRotation(conditions, () => advances++, clock);
    clock.tick(7_999);
    assert.equal(advances, 0);
    clock.tick(1);
    assert.equal(advances, 1);
    clock.tick(HERO_ROTATION_DELAY * 2);
    assert.equal(advances, 1);
});

for (const [reason, change] of [
    ['une sélection vide', { itemCount: 0 }],
    ['un seul titre', { itemCount: 1 }],
    ['les mouvements désactivés ou réduits', { motionAllowed: false }],
    ['la pause explicite', { paused: true }],
    ['le survol', { hovered: true }],
    ['le focus clavier', { focused: true }],
    ['un onglet masqué', { pageVisible: false }],
]) {
    test(`Aucun changement automatique avec ${reason}`, () => {
        const clock = fakeClock();
        let advances = 0;
        scheduleHeroRotation({ ...conditions, ...change }, () => advances++, clock);
        assert.equal(clock.pendingCount, 0);
        clock.tick(HERO_ROTATION_DELAY * 2);
        assert.equal(advances, 0);
    });
}

test('Une interaction annule le délai précédent et donne huit secondes à la reprise', () => {
    const clock = fakeClock();
    let advances = 0;
    const stop = scheduleHeroRotation(conditions, () => advances++, clock);
    clock.tick(7_000);
    stop();
    clock.tick(1_000);
    assert.equal(advances, 0);
    const stopAfterResume = scheduleHeroRotation(conditions, () => advances++, clock);
    clock.tick(7_999);
    assert.equal(advances, 0);
    clock.tick(1);
    assert.equal(advances, 1);
    stopAfterResume();
});

test('Le démontage du composant annule le changement en attente', () => {
    const clock = fakeClock();
    let advances = 0;
    const stop = scheduleHeroRotation(conditions, () => advances++, clock);
    stop();
    assert.equal(clock.pendingCount, 0);
    clock.tick(HERO_ROTATION_DELAY);
    assert.equal(advances, 0);
});

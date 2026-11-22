import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
    describeTrack,
    matchPreferredTrack,
    playerStorageKey,
    readPlayerPreferences,
    savePlayerPreferences,
} from '../frontend/src/utils/playerPreferences.ts';

const storage = new Map();
globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
};

beforeEach(() => {
    storage.clear();
    storage.set('jf_server', 'https://fixture.invalid');
    storage.set('jf_user', 'alice');
});

test('Volume nul, silence et luminosité survivent aux relectures', () => {
    savePlayerPreferences({ volume: 0, muted: true, brightness: 0.7 });
    assert.equal(readPlayerPreferences().volume, 0);
    assert.equal(readPlayerPreferences().muted, true);
    assert.equal(readPlayerPreferences().brightness, 0.7);
});

test('Les préférences sont isolées par utilisateur et serveur', () => {
    savePlayerPreferences({ volume: 0.4, subtitle: 'off' });
    storage.set('jf_user', 'bob');
    assert.equal(readPlayerPreferences().volume, 1);
    assert.equal(readPlayerPreferences().subtitle, undefined);
    savePlayerPreferences({ brightness: 1.2 });
    storage.set('jf_user', 'alice');
    assert.equal(readPlayerPreferences().volume, 0.4);
    storage.set('jf_server', 'https://another-fixture.invalid');
    assert.equal(readPlayerPreferences().subtitle, undefined);
});

test('Une ancienne valeur de volume valide est conservée', () => {
    storage.set('playerVolume', '0');
    assert.equal(readPlayerPreferences().volume, 0);
});

test('Les données corrompues ou hors limites ne cassent pas le lecteur', () => {
    for (const value of ['null', '[]', 'invalid']) {
        storage.set(playerStorageKey('arko-player-v1'), value);
        assert.deepEqual(readPlayerPreferences(), { volume: 1, muted: false, brightness: 1 });
    }
    storage.set(playerStorageKey('arko-player-v1'), JSON.stringify({ volume: -20, brightness: 100, audio: [], subtitle: 3 }));
    assert.equal(readPlayerPreferences().volume, 0);
    assert.equal(readPlayerPreferences().brightness, 1.5);
    assert.equal(readPlayerPreferences().audio, undefined);
});

test('Un stockage indisponible laisse la lecture fonctionner', () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
    try {
        assert.equal(readPlayerPreferences().volume, 1);
        assert.doesNotThrow(() => savePlayerPreferences({ volume: 0.3 }));
    } finally {
        globalThis.localStorage = original;
    }
});

test('La langue choisie suit les épisodes même si les indices changent', () => {
    const preference = describeTrack({ Type: 'Audio', Index: 2, Language: 'fra', Codec: 'aac', Channels: 2 });
    const streams = [
        { Type: 'Audio', Index: 2, Language: 'eng', Codec: 'aac', Channels: 2 },
        { Type: 'Audio', Index: 9, Language: 'fra', Codec: 'aac', Channels: 2 },
    ];
    assert.equal(matchPreferredTrack(streams, preference).Index, 9);
    assert.equal(matchPreferredTrack([{ Language: 'eng' }], preference), undefined);
});

test('Les sous-titres forcés et malentendants conservent leur préférence', () => {
    const preference = describeTrack({ Language: 'fra', Codec: 'srt', IsForced: false, IsHearingImpaired: true });
    const streams = [
        { Index: 3, Language: 'fra', IsForced: true, IsHearingImpaired: false },
        { Index: 7, Language: 'fra', IsForced: false, IsHearingImpaired: true },
    ];
    assert.equal(matchPreferredTrack(streams, preference).Index, 7);
    savePlayerPreferences({ subtitle: 'off' });
    assert.equal(readPlayerPreferences().subtitle, 'off');
});

test('Une piste sans langue exige un titre correspondant', () => {
    assert.equal(matchPreferredTrack([{ Index: 5 }], {}), undefined);
    assert.equal(matchPreferredTrack([{ Index: 5, Title: 'Commentary' }], { title: 'Commentary' }).Index, 5);
});

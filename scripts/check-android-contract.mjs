import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stopSessionRequests } from '../packages/core/src/utils/playbackSessionRequests.ts';
import { androidDeviceProfile } from '../packages/core/src/utils/androidDeviceProfile.ts';
import { selectVideoPlayer } from '../frontend/src/utils/selectVideoPlayer.ts';

test('Seule la compilation Android exécutée sur Android sélectionne LibVLC', () => {
    assert.equal(selectVideoPlayer('android', 'android'), 'libvlc');
    for (const [mode, platform] of [['production', 'web'], ['android', 'web'], ['production', 'android'], ['desktop', 'android'], ['android', 'ios']]) {
        assert.equal(selectVideoPlayer(mode, platform), 'web');
    }
});

test('Cleanup reste borné au bon appareil et à la bonne session', () => {
    const requests = stopSessionRequests({ itemId: 'fixture', positionTicks: 1230000, playSessionId: 'session&other=x', deviceId: 'device/1' });
    assert.equal(requests[0].body.PositionTicks, 1230000);
    const url = new URL(requests[1].path + '?' + new URLSearchParams(requests[1].params), 'https://fixture.invalid/');
    assert.equal(url.searchParams.get('playSessionId'), 'session&other=x');
    assert.equal(url.searchParams.get('deviceId'), 'device/1');
    assert.equal(url.searchParams.size, 2);
    assert.equal(stopSessionRequests({ itemId: 'fixture', positionTicks: 100, deviceId: 'd' }).length, 1);
});
test('Profil LibVLC borné et transcodage H264 AAC conservé', () => {
    const profile = androidDeviceProfile();
    assert.match(profile.DirectPlayProfiles[0].Container, /mkv/);
    assert.equal(profile.TranscodingProfiles[0].VideoCodec, 'h264');
    assert.equal(profile.TranscodingProfiles[0].AudioCodec, 'aac');
    assert(profile.CodecProfiles[0].Conditions.some((c) => c.Property === 'VideoRangeType' && c.Value === 'SDR'));
});

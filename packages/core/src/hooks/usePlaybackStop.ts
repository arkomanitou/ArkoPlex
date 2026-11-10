import { getApi } from '../api/getApi';
import { useMutation } from '@tanstack/react-query';
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api';

interface StopPlayback {
    itemId: string;
    positionTicks: number;
    playSessionId?: string;
}

export async function stopPlaybackSession({ itemId, positionTicks, playSessionId }: StopPlayback) {
    if (!itemId) throw new Error('Item ID is required');
    const api = getApi();
    // The authenticated device identifies its own session. Never use the first
    // result of /Sessions, which can belong to another device or family member.
    const requests = [
        getSessionApi(api).reportPlaybackStopped({
            playbackStopInfo: {
                ItemId: itemId,
                PlaySessionId: playSessionId,
                PositionTicks: positionTicks,
            },
        }),
    ];
    if (playSessionId) {
        // SDK 1.0 omits this endpoint. Bound both IDs so other sessions keep playing.
        requests.push(
            api.axiosInstance.delete(api.getUri('Videos/ActiveEncodings'), {
                headers: { Authorization: api.authorizationHeader },
                params: { deviceId: api.deviceInfo.id, playSessionId },
            })
        );
    }
    // A failed progress report must not prevent stopping the encoding, or vice versa.
    const results = await Promise.allSettled(requests);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return itemId;
}

export function usePlaybackStop() {
    const { mutate: stopPlayback, isPending } = useMutation({
        mutationFn: stopPlaybackSession,
        meta: { silentFail: true },
    });
    return { stopPlayback, isStopping: isPending };
}

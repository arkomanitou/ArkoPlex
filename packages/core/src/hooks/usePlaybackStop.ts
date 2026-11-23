import { getApi } from '../api/getApi';
import { useMutation } from '@tanstack/react-query';
import { stopSessionRequests } from '../utils/playbackSessionRequests';

interface StopPlayback {
    itemId: string;
    positionTicks: number;
    playSessionId?: string;
}

export async function stopPlaybackSession({ itemId, positionTicks, playSessionId }: StopPlayback) {
    if (!itemId) throw new Error('Item ID is required');
    const api = getApi();
    const requests = stopSessionRequests({
        itemId,
        positionTicks,
        playSessionId,
        deviceId: api.deviceInfo.id,
    }).map((request) =>
        api.axiosInstance.request({
            method: request.method,
            url: api.getUri(request.path),
            headers: { Authorization: api.authorizationHeader },
            data: request.body,
            params: request.params,
        })
    );
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

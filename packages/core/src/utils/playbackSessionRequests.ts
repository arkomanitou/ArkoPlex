/** Shared by browser cleanup and the native session owner. No credentials here. */
export interface SessionRequest {
    method: 'POST' | 'DELETE';
    path: string;
    body?: Record<string, unknown>;
    params?: Record<string, string>;
}

export function stopSessionRequests(options: {
    itemId: string;
    positionTicks: number;
    playSessionId?: string;
    deviceId: string;
}): SessionRequest[] {
    const { itemId, positionTicks, playSessionId, deviceId } = options;
    if (!itemId) throw new Error('Item ID is required');
    const requests: SessionRequest[] = [
        {
            method: 'POST',
            path: 'Sessions/Playing/Stopped',
            body: {
                ItemId: itemId,
                PlaySessionId: playSessionId,
                PositionTicks: positionTicks,
            },
        },
    ];
    if (playSessionId) {
        requests.push({
            method: 'DELETE',
            path: 'Videos/ActiveEncodings',
            params: { deviceId, playSessionId },
        });
    }
    return requests;
}

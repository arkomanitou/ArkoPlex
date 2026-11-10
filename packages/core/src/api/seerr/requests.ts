import { withBasePath } from '../../utils/basePath';
import type { SeerrMediaInfo, SeerrMediaStatus, SeerrMediaType, SeerrRequestStatus } from './types';

export interface SeerrOwnRequest {
    id: number;
    status: SeerrRequestStatus;
    createdAt: string;
    is4k: boolean;
    seasons?: { seasonNumber: number }[];
    media: SeerrMediaInfo & {
        tmdbId: number;
        mediaType: SeerrMediaType;
        status4k?: SeerrMediaStatus;
    };
}

export interface SeerrOwnRequestsPage {
    results: SeerrOwnRequest[];
    total: number;
    skip: number;
    take: number;
}

export async function getSeerrOwnRequests(
    skip = 0,
    signal?: AbortSignal
): Promise<SeerrOwnRequestsPage> {
    const response = await fetch(withBasePath(`/api/seerr/requests?skip=${skip}`), {
        signal,
        credentials: 'include',
        cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Impossible de charger les demandes (${response.status}).`);
    return response.json();
}

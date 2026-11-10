import { useQuery } from '@tanstack/react-query';
import type { SeerrMediaType, SeerrRecommendationItem } from '../api/seerr/types';
import { getServerUrl, getUserId } from '../utils/localstorageCredentials';
import { getSeerrRecommendations } from '../api/seerr/recommendations';

export function useSeerrRecommendations(mediaType: SeerrMediaType, id: string | undefined) {
    return useQuery<SeerrRecommendationItem[]>({
        queryKey: ['seerrRecommendations', mediaType, id, getServerUrl(), getUserId()],
        queryFn: () => getSeerrRecommendations(mediaType, id!),
        enabled: !!id,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });
}

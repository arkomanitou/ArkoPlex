import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
    discoveryStatus,
    useOwnDiscoveryRequests,
    useSeerrItemDetails,
    type SeerrOwnRequest,
} from '@pelagica/core';
import { Button } from '@/components/ui/button';
import { DiscoveryCard } from './DiscoveryCard';

function RequestCard({ request }: { request: SeerrOwnRequest }) {
    const {
        data: details,
        isError,
        refetch,
    } = useSeerrItemDetails(request.media.mediaType, request.media.tmdbId, true);
    const status = request.is4k ? request.media.status4k : request.media.status;
    return (
        <div>
            <DiscoveryCard
                item={{
                    ...details,
                    id: request.media.tmdbId,
                    mediaType: request.media.mediaType,
                    title:
                        details?.title ||
                        `${request.media.mediaType === 'tv' ? 'Série' : 'Film'} · TMDB ${request.media.tmdbId}`,
                    mediaInfo: { ...request.media, status: status ?? request.media.status },
                }}
                statusLabel={discoveryStatus(status, request.status)}
                extra={[
                    request.is4k ? '4K' : '',
                    request.seasons?.length
                        ? `Saison${request.seasons.length > 1 ? 's' : ''} ${request.seasons.map((season) => season.seasonNumber).join(', ')}`
                        : '',
                ]
                    .filter(Boolean)
                    .join(' · ')}
            />
            {isError && (
                <button className="arko-discover-retry" onClick={() => void refetch()}>
                    Réessayer le chargement de la fiche
                </button>
            )}
        </div>
    );
}

export function DiscoveryRequests() {
    const query = useOwnDiscoveryRequests(true);
    // Only mount metadata queries for a small visible batch of request cards.
    const [visibleCount, setVisibleCount] = useState(6);
    const requests = query.data?.pages.flatMap((page) => page.results) ?? [];
    const unique = requests.filter(
        (request, index) => requests.findIndex((other) => other.id === request.id) === index
    );
    const visible = unique.slice(0, visibleCount);
    return (
        <section aria-labelledby="arko-requests-title">
            <div className="arko-discover-section-title">
                <div>
                    <h2 id="arko-requests-title">Mes demandes</h2>
                    <p>
                        Les demandes du compte Jellyseerr connecté. Le suivi s’actualise chaque
                        minute tant que cet onglet est ouvert.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={query.isFetching}
                    onClick={() => void query.refetch()}
                >
                    <RefreshCw size={16} />
                    Actualiser
                </Button>
            </div>
            {query.isPending && <p role="status">Chargement de vos demandes…</p>}
            {query.isError && (
                <p role="alert" className="arko-discover-notice">
                    Impossible de récupérer vos demandes. Vérifiez la connexion à Jellyseerr, puis
                    réessayez.
                </p>
            )}
            {!query.isPending && !query.isError && unique.length === 0 && (
                <p className="arko-discover-empty">
                    Vous n’avez pas encore de demande sur ce compte.
                </p>
            )}
            <div className="arko-discover-grid">
                {visible.map((request) => (
                    <RequestCard key={request.id} request={request} />
                ))}
            </div>
            {(visibleCount < unique.length || query.hasNextPage) && (
                <div className="arko-discover-more">
                    <Button
                        variant="outline"
                        disabled={query.isFetching}
                        onClick={() => {
                            setVisibleCount((count) => count + 6);
                            if (visibleCount + 6 > unique.length && query.hasNextPage)
                                void query.fetchNextPage();
                        }}
                    >
                        {query.isFetching ? 'Chargement…' : 'Voir plus de demandes'}
                    </Button>
                </div>
            )}
        </section>
    );
}

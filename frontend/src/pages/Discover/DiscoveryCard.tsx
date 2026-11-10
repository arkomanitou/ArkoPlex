import { ImageOff, Plus } from 'lucide-react';
import { discoveryStatus, type DiscoverySuggestion } from '@pelagica/core';
import { getSeerrItemPosterUrl } from '@/utils/seerUrls';
import { useSeerrItemClick } from '@/hooks/useSeerrItemClick';

export function DiscoveryCard({
    item,
    statusLabel,
    extra,
}: {
    item: DiscoverySuggestion;
    statusLabel?: string;
    extra?: string;
}) {
    const handleClick = useSeerrItemClick();
    const status = statusLabel ?? discoveryStatus(item.mediaInfo?.status);
    return (
        <article className="arko-discover-card">
            <button
                className="arko-discover-poster"
                onClick={() => handleClick(item)}
                aria-label={`Ouvrir la fiche de ${item.title}`}
            >
                {item.posterPath ? (
                    <img src={getSeerrItemPosterUrl(item.posterPath)} alt="" loading="lazy" />
                ) : (
                    <ImageOff aria-hidden="true" />
                )}
                <span className="arko-discover-status" data-status={item.mediaInfo?.status}>
                    <span aria-hidden="true" />
                    {status}
                </span>
            </button>
            <h3>{item.title}</h3>
            <p className="arko-discover-meta">
                {item.mediaType === 'movie' ? 'Film' : 'Série'}
                {item.releaseDate ? ` · ${item.releaseDate.slice(0, 4)}` : ''}
                {extra ? ` · ${extra}` : ''}
            </p>
            {item.reason && <p className="arko-discover-reason">{item.reason}</p>}
            <button className="arko-discover-card-action" onClick={() => handleClick(item)}>
                {status === 'À demander' ? (
                    <>
                        <Plus size={14} aria-hidden="true" />
                        Demander
                    </>
                ) : item.mediaInfo?.status === 5 ? (
                    'Voir dans ma bibliothèque'
                ) : (
                    'Voir la fiche'
                )}
            </button>
        </article>
    );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Info, Play, Star } from 'lucide-react';
import {
    getBackdropUrl,
    ticksToReadableTime,
    useMediaBarItems,
    type SectionItemsConfig,
} from '@pelagica/core';
import { buildPlayerUrl } from '@/utils/playerUrl';
import FavoriteButton from '@/components/FavoriteButton';
import { CinematicSurface } from './CinematicSurface';

interface ArkoHeroProps {
    itemsConfig?: SectionItemsConfig;
    title?: string;
    className?: string;
    showFavoriteButton?: boolean;
    size?: string;
}

export function ArkoHero({
    itemsConfig,
    title,
    className = '',
    showFavoriteButton = true,
    size = 'large',
}: ArkoHeroProps) {
    const { data: items, isLoading, isError, refetch } = useMediaBarItems(itemsConfig);
    const [selected, setSelected] = useState(0);
    const [failed, setFailed] = useState<string | null>(null);
    if (isLoading)
        return (
            <div className="arko-hero-placeholder" role="status">
                Votre sélection se prépare…
            </div>
        );
    if (isError)
        return (
            <div className="arko-hero-placeholder">
                <p>La sélection est indisponible.</p>
                <button type="button" onClick={() => void refetch()}>
                    Réessayer
                </button>
            </div>
        );
    if (!items?.length)
        return (
            <div className="arko-hero-placeholder">
                Aucun film ou série disponible dans vos bibliothèques.
            </div>
        );
    const index = selected % items.length;
    const item = items[index];
    const position = item.UserData?.PlaybackPositionTicks ?? 0;
    const runtime = item.RunTimeTicks ?? 0;
    const progress = runtime > 0 ? Math.max(0, Math.min(100, (position / runtime) * 100)) : 0;
    const isSeries = item.Type === 'Series';
    const playURL = isSeries ? `/item/${item.Id}` : buildPlayerUrl(item.Id!, '/');
    return (
        <CinematicSurface key={item.Id} className={`arko-hero ${className}`}>
            <div className="arko-hero-backdrop" data-size={size}>
                {failed !== item.Id && (
                    <img
                        className="arko-cinematic-image"
                        src={getBackdropUrl(item.Id!, { maxWidth: 1920 }, item.ImageTags?.Backdrop)}
                        alt=""
                        onError={() => setFailed(item.Id!)}
                    />
                )}
            </div>
            <div className="arko-hero-copy">
                <p className="arko-eyebrow">{title || 'Le choix du soir'}</p>
                <h1 className="arko-hero-title">{item.Name}</h1>
                <div className="arko-hero-meta">
                    {item.ProductionYear && <span>{item.ProductionYear}</span>}
                    {runtime > 0 && <span>{ticksToReadableTime(runtime)}</span>}
                    {item.Genres?.slice(0, 2).map((genre) => (
                        <span key={genre}>{genre}</span>
                    ))}
                    {item.CommunityRating != null && (
                        <span className="arko-rating">
                            <Star size={13} aria-hidden="true" />
                            {item.CommunityRating.toFixed(1)}
                        </span>
                    )}
                </div>
                {item.Overview && (
                    <p className="arko-hero-overview">{item.Overview.replace(/<[^>]*>/g, '')}</p>
                )}
                <div className="arko-hero-actions">
                    <Link className="arko-primary-action" to={playURL}>
                        <Play size={18} aria-hidden="true" />
                        {isSeries ? 'Choisir un épisode' : position > 0 ? 'Reprendre' : 'Regarder'}
                    </Link>
                    <Link className="arko-secondary-action" to={`/item/${item.Id}`}>
                        <Info size={18} aria-hidden="true" />
                        Découvrir
                    </Link>
                    <FavoriteButton item={item} showFavoriteButton={showFavoriteButton} />
                </div>
                {progress > 0 && !isSeries && (
                    <div className="arko-hero-progress">
                        <span
                            role="progressbar"
                            aria-label="Progression de lecture"
                            aria-valuenow={Math.round(progress)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                        >
                            <span style={{ width: `${progress}%` }} />
                        </span>
                        <span>{ticksToReadableTime(position)} regardées</span>
                    </div>
                )}
            </div>
            <div className="arko-hero-pager">
                <button
                    type="button"
                    onClick={() => setSelected((index + items.length - 1) % items.length)}
                    aria-label="Titre précédent"
                >
                    <ChevronLeft size={19} />
                </button>
                <span>
                    {index + 1} / {items.length}
                </span>
                <button
                    type="button"
                    onClick={() => setSelected((index + 1) % items.length)}
                    aria-label="Titre suivant"
                >
                    <ChevronRight size={19} />
                </button>
            </div>
        </CinematicSurface>
    );
}

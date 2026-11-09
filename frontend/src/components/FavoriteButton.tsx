import { Button } from '@/components/ui/button';
import { useFavorite } from '@pelagica/core';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNightPulseMotion } from './arkoplex/useNightPulseMotion';

interface FavoriteButtonProps {
    item: BaseItemDto;
    showFavoriteButton?: boolean | undefined;
    size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg' | null | undefined;
    variant?:
        'default' | 'link' | 'destructive' | 'outline' | 'secondary' | 'ghost' | null | undefined;
}

const FavoriteButton = ({
    item,
    showFavoriteButton,
    size = 'icon',
    variant = 'outline',
}: FavoriteButtonProps) => {
    const { t } = useTranslation('item');
    const { isFavorite, toggleFavoriteAsync, isLoading: isFavoriteLoading } = useFavorite(item.Id);
    const ref = useRef<HTMLSpanElement>(null);
    const motion = useNightPulseMotion();
    useEffect(() => {
        const node = ref.current;
        const cancel = () =>
            node?.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
        if (!motion) cancel();
        return cancel;
    }, [motion]);

    const toggle = async () => {
        const added = !isFavorite;
        try {
            await toggleFavoriteAsync(added);
            const parent = ref.current;
            if (
                !motion ||
                !parent ||
                window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
                document.documentElement.dataset.arkoMotion === 'off'
            )
                return;
            parent
                .querySelector('svg')
                ?.animate?.(
                    [
                        { transform: 'scale(1)' },
                        { transform: 'scale(1.22)', offset: 0.4 },
                        { transform: 'scale(1)' },
                    ],
                    { duration: 360 }
                );
            if (!added) return;
            parent.querySelectorAll<HTMLElement>('.arko-spark').forEach((spark, index) => {
                const angle = ((-145 + index * 60) * Math.PI) / 180;
                spark.animate?.(
                    [
                        { opacity: 0, transform: 'translate(0,0)' },
                        { opacity: 0.9, offset: 0.2 },
                        {
                            opacity: 0,
                            transform: `translate(${Math.cos(angle) * 35}px,${Math.sin(angle) * 35}px)`,
                        },
                    ],
                    { duration: 480 }
                );
            });
        } catch {
            toast.error('Le favori n’a pas pu être enregistré.');
        }
    };

    if (showFavoriteButton === false) return null;

    return (
        <span ref={ref} className="arko-favorite-wrap">
            <Button
                type="button"
                variant={variant}
                size={size}
                onClick={() => void toggle()}
                disabled={isFavoriteLoading}
                title={isFavorite ? t('unfavorite') : t('favorite')}
                aria-label={isFavorite ? t('unfavorite') : t('favorite')}
                aria-pressed={isFavorite}
            >
                <Heart fill={isFavorite ? 'currentColor' : 'none'} />
            </Button>
            <span aria-hidden="true" className="arko-favorite-burst">
                {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} className="arko-spark" />
                ))}
            </span>
        </span>
    );
};

export default FavoriteButton;

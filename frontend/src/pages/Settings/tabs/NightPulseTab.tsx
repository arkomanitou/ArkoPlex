import type { AppConfig } from '@pelagica/core';
import { BooleanInput, RadioInput } from '../components/SettingsInputs';

export function NightPulseTab({
    config,
    saveConfig,
}: {
    config: AppConfig;
    saveConfig: (updater: (prev: AppConfig) => AppConfig) => void;
}) {
    return (
        <div className="max-w-200 arko-settings-intro">
            <p className="arko-eyebrow">Votre cinéma. Votre univers.</p>
            <h1 className="text-3xl font-medium mb-3">ArkoPlex · Night Pulse</h1>
            <p className="text-muted-foreground mb-5">
                Les réglages de cette application sont conservés par ArkoPlex. Vos comptes, favoris
                et positions de lecture restent gérés par Jellyfin.
            </p>
            <BooleanInput
                label="Identité Night Pulse"
                checked={config.nightPulseEnabled !== false}
                onChange={(value) => saveConfig((prev) => ({ ...prev, nightPulseEnabled: value }))}
            />
            <RadioInput
                label="Mouvements de l’interface"
                value={config.nightPulseMotion || 'system'}
                onChange={(value) =>
                    saveConfig((prev) => ({ ...prev, nightPulseMotion: value as 'system' | 'off' }))
                }
                options={[
                    { value: 'system', label: 'Discrets · respecter le réglage de l’appareil' },
                    { value: 'off', label: 'Désactivés' },
                ]}
            />
            <p className="text-sm text-muted-foreground mt-4">
                Les bandes-annonces automatiques sont désactivées par défaut. Les effets de souris
                sont réservés aux grands écrans.
            </p>
        </div>
    );
}

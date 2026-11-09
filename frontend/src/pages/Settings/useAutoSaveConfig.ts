import { useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConfig, useUpdateConfig, type AppConfig } from '@pelagica/core';
import { getServerUrl } from '@pelagica/core';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export const useAutoSaveConfig = () => {
    const { t } = useTranslation('settings');
    const { config, loading, error } = useConfig();
    const { updateConfig } = useUpdateConfig();
    const queryClient = useQueryClient();
    const queue = useRef<Promise<void>>(Promise.resolve());
    const pending = useRef(0);
    const saved = useRef(config);
    useEffect(() => {
        if (!loading && pending.current === 0) saved.current = config;
    }, [config, loading]);

    const saveConfig = useCallback(
        (updater: (prev: AppConfig) => AppConfig) => {
            const key = ['config', getServerUrl()];
            const previous = queryClient.getQueryData<AppConfig>(key) ?? config;
            const newConfig = updater(previous);
            queryClient.setQueryData(key, newConfig);
            pending.current += 1;
            queue.current = queue.current
                .catch(() => undefined)
                .then(async () => {
                    try {
                        await updateConfig(newConfig);
                        saved.current = newConfig;
                    } catch {
                        if (
                            JSON.stringify(queryClient.getQueryData(key)) ===
                            JSON.stringify(newConfig)
                        )
                            queryClient.setQueryData(key, saved.current);
                        toast.error(t('settings_save_error'));
                    } finally {
                        pending.current -= 1;
                    }
                });
        },
        [config, queryClient, updateConfig, t]
    );

    return { config, loading, error, saveConfig };
};

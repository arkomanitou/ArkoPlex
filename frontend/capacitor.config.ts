import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'app.arkoplex.android',
    appName: 'ArkoPlex',
    webDir: 'dist',
    loggingBehavior: 'none',
    android: { allowMixedContent: true, webContentsDebuggingEnabled: false },
    server: { androidScheme: 'https' },
    plugins: { CapacitorHttp: { enabled: true } },
};
export default config;

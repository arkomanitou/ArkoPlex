/** A browser must keep Video.js even when previewing an Android compilation. */
export function selectVideoPlayer(buildMode: string, runtimePlatform: string): 'web' | 'libvlc' {
    return buildMode === 'android' && runtimePlatform === 'android' ? 'libvlc' : 'web';
}

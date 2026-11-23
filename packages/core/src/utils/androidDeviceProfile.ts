/** Deliberately bounded software-decoding profile; no HDR/passthrough guarantee. */
export function androidDeviceProfile() {
    return {
        Name: 'ArkoPlex Android LibVLC 3.7.8',
        MaxStreamingBitrate: 40_000_000,
        MaxStaticBitrate: 80_000_000,
        DirectPlayProfiles: [
            {
                Container: 'mp4,mkv,webm,mov,ts,mpegts,avi',
                Type: 'Video' as const,
                VideoCodec: 'h264,hevc,mpeg4,mpeg2video,vp8,vp9',
                AudioCodec: 'aac,mp3,ac3,eac3,flac,opus,vorbis,pcm_s16le',
            },
        ],
        TranscodingProfiles: [
            {
                Container: 'ts',
                Type: 'Video' as const,
                VideoCodec: 'h264',
                AudioCodec: 'aac',
                Protocol: 'hls' as const,
                Context: 'Streaming' as const,
                MaxAudioChannels: '2',
            },
        ],
        CodecProfiles: [
            {
                Type: 'Video' as const,
                Conditions: [
                    {
                        Condition: 'LessThanEqual' as const,
                        Property: 'Width' as const,
                        Value: '1920',
                        IsRequired: true,
                    },
                    {
                        Condition: 'LessThanEqual' as const,
                        Property: 'Height' as const,
                        Value: '1080',
                        IsRequired: true,
                    },
                    {
                        Condition: 'LessThanEqual' as const,
                        Property: 'VideoBitDepth' as const,
                        Value: '8',
                        IsRequired: true,
                    },
                    {
                        Condition: 'Equals' as const,
                        Property: 'VideoRangeType' as const,
                        Value: 'SDR',
                        IsRequired: true,
                    },
                ],
            },
        ],
        SubtitleProfiles: [
            ...['srt', 'ass', 'ssa', 'sub', 'pgssub', 'dvdsub', 'vtt'].map((Format) => ({
                Format,
                Method: 'Embed' as const,
            })),
            ...['srt', 'ass', 'ssa', 'vtt'].map((Format) => ({
                Format,
                Method: 'External' as const,
            })),
        ],
    };
}

export interface Meta {
    metaVersion: 2;
    host: string;
    exportedAt: string;
    emojis: Emoji[];
}

export interface Emoji {
    downloaded: boolean;
    fileName: string;
    emoji: {
        name: string;
        category: string;
        aliases: string[];
    }
}
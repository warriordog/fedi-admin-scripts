// We moved the type into the config itself, to reduce duplication
import {AnnouncementConfig, Config, default as configFile} from "../../../config/importBlocklist.js";

export * from '../../../config/importBlocklist.js';

export const defaultAnnouncementConfig: AnnouncementConfig = {
    enabled: false,
    publishPosts: false,
    includeInstanceName: true,
    includeNumberOfBlocks: false,
    includeUpdatedBlocks: true,
    includeBlockReason: true,
    includeRedactedBlocks: false,
    groupByAction: false,
    sortBlocks: true
};

export const defaultConfig: Config = {
    retractBlocks: false,
    dryRun: false,
    fastMode: false,
    crossSync: false,
    announcements: defaultAnnouncementConfig,
    printLostFollows: true,
    sources: [],
    remotes: []
}

export function readConfigFile(): Config {
    // Overlay the config on top of defaults.
    const config: Config = Object.assign({}, defaultConfig, configFile);

    // Recursively overlay announcement config on top of defaults.
    if (configFile.announcements) {
        config.announcements = Object.assign({}, defaultAnnouncementConfig, configFile.announcements);
    }

    return config;
}

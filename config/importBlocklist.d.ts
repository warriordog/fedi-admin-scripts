import {Block} from "../src/blocklist-import/domain/block.js";

export interface Config {
    /**
     * If true, then existing blocks will be revoked if they do not exist in any blocklist.
     * Not implemented yet.
     * Default: false
     */
    retractBlocks?: boolean;

    /**
     * If true, then blocks will not be saved to any instance.
     * Instead, the predicted actions will be printed to the console.
     * Default: false
     */
    dryRun?: boolean;

    /**
     * If true, then blocks will be uploaded through a faster method that reduces API calls.
     * While processing blocks, it will be unsafe to use the instance's federation controls directly.
     * Doing so could cause blocks to be rolled back or applied incorrectly.
     * Not implemented yet.
     * Default: false
     */
    fastMode?: boolean;

    /**
     * If true, then an announcement post will be generated for each instance.
     * If set to an object, then custom rules and formatting can be applied.
     * Default: false
     */
    generateAnnouncements?: boolean | Partial<AnnouncementConfig>;

    /**
     * List of blocklists to load, as an array of SourceConfig objects.
     * Each should specify two properties:
     *  1. "type" - must be set to "mastodon".
     *  2. "path" - path to the source file.
     *
     * At least one source must be provided.
     * Entries will be de-duplicated by merging all duplicates and keeping all actions that appear at least once.
     *
     * Mastodon-format lists should be CSV files in the extended Mastodon format:
     *  * domain (string, required) - hostname of the instance to block.
     *  * severity (string) - one of 'suspend', 'silence', 'ghost', or 'none'.
     *      * suspend - completely disconnects the instance (implies 'silence' and 'ghost')
     *      * silence - hides posts and profiles from anyone who isn't following them.
     *      * disconnect - stops delivering local posts to the remote instance.
     *      * none - take no action (other fields still apply).
     *  * public_comment (string) - public block reason.
     *  * reject_media (boolean) - true if media attachments should be ignored.
     *  * reject_reports (boolean) - true if abuse reports should be ignored.
     *  * obfuscate (boolean) - true if the block should be unlisted, hidden, or obfuscated.
     *  * set_nsfw (boolean) - true if media from the instance should be flagged as NSFW.
     *  * reject_avatars (boolean) - true if profile avatars should be ignored.
     *  * reject_banners (boolean) - true if profile banner images should be ignored.
     *  * reject_backgrounds (boolean) - true if profile background images should be ignored.
     *  * private_comment (string) - private (staff-only) block reason.
     */
    sources: SourceConfig[];

    /**
     * List of instances to apply blocks, as an array of RemoteConfig objects.
     * Each should specify three properties:
     *  1. "type" - one of "sharkey", "pleroma", or "akkoma".
     *  2. "host" - hostname of the instance.
     *  3. "token" - session token of an admin user.
     *
     * At least one remote must be provided.
     */
    remotes: RemoteConfig[];
}

export interface AnnouncementConfig {
    /**
     * If true, announcements will be generated.
     * Default: true
     */
    enabled: boolean;

    /**
     * If true, then announcements will be automatically posted by the admin user.
     * Default: false
     */
    publishPosts: boolean;

    /**
     * If true, then the local instance name will be included.
     * Default: true
     */
    includeInstanceName: boolean;

    /**
     * If true, then the number of new / updated blocks will be included.
     * Default: false
     */
    includeNumberOfBlocks: boolean;

    /**
     * If true, then updated blocks will be listed.
     * Default: true
     */
    includeUpdatedBlocks: boolean;

    /**
     * If true, then the public block reason will be listed.
     * Default: true
     */
    includeBlockReason: boolean;

    /**
     * If true, then redacted blocks will be listed.
     * Default: false
     */
    includeRedactedBlocks: boolean;

    /**
     * Optional filter to selectively include blocks.
     * Return true to include the block, or false to exclude it.
     * @param block
     */
    blockFilter?: (block: Block) => boolean;

    /**
     * If true, then blocks will be grouped based on which actions are applied.
     * Default: false
     */
    groupByAction: boolean;

    /**
     * If true, then blocks will be sorted alphabetically by host name.
     * Default: true
     */
    sortBlocks: boolean;
}

export interface SourceConfig {
    /**
     * Format of the source file.
     * Must be set to "mastodon".
     */
    type: SourceType;

    /**
     * Path to the source file, relative to the current working directory.
     */
    path: string;
}

export type SourceType = 'mastodon';

export interface RemoteConfig {
    /**
     * Type of software in use on the remote instance.
     * Must be either "sharkey" or "pleroma".
     */
    type: RemoteType;

    /**
     * Domain / host name of the remote instance.
     */
    host: string;

    /**
     * Session token for a user with administrative permissions on this instance.
     */
    token: string;
}

export type RemoteType = 'sharkey' | 'pleroma' | 'akkoma';



const config: Config;
export default config;


// TODO fast mode

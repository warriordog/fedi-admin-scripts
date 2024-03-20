import {PartialBlockResult, Remote, RemoteSoftware} from "../Remote.js";
import {PleromaClient} from "../../../common/api/pleroma/PleromaClient.js";
import {Config} from "../../../../config/importBlocklist.js";
import {Block} from "../../domain/block.js";
import {PleromaConfig, PleromaConfigSection, Tuple} from "../../../common/api/pleroma/PleromaConfig.js";
import {Post} from "../../domain/post.js";
import {PleromaInstance} from "../../../common/api/pleroma/pleromaInstance.js";

/**
 * Applies blocks to Pleroma / Akkoma instances.
 * Supports Akkoma's "background_removal" action for mrf_simple.
 */
export class PleromaRemote extends Remote {
    readonly tracksFollowers = false;
    readonly tracksFollows = false;
    readonly seversFollowers = false;
    readonly seversFollows = false;


    private readonly client: PleromaClient;

    constructor(
        private readonly config: Config,
        public readonly host: string,
        token: string
    ) {
        super();
        this.client = new PleromaClient(host, token);
    }

    async applyBlock(block: Block): Promise<PartialBlockResult> {
        // Pleroma can't disconnect without a full suspension
        if (block.limitFederation === 'ghost') {
            return 'unsupported';
        }

        // map the federation limit into individuals flags
        const isSuspend = block.limitFederation === 'suspend';
        const isSilence = block.limitFederation === 'suspend' || block.limitFederation === 'silence';
        const isUnlist = block.limitFederation === 'suspend' || block.limitFederation === 'silence' || block.limitFederation === 'unlist';

        // Read config
        const instanceConfig = await this.getConfig();
        const mrfSimpleSection = findConfigSection(instanceConfig, ':pleroma', ':mrf_simple') as MRFSection;
        const mrfSection = findConfigSection(instanceConfig, ':pleroma', ':mrf') as MRFSection;

        // Unpack tuple objects.
        // Each one is a list of [domain, block reason] pairs for a particular category (but in a really weird format).
        const federatedTimelineRemoval = getTuple(mrfSimpleSection, ':federated_timeline_removal');
        const reject = getTuple(mrfSimpleSection, ':reject');
        const followersOnly = getTuple(mrfSimpleSection, ':followers_only');
        const mediaRemoval = getTuple(mrfSimpleSection, ':media_removal');
        const mediaNSFW = getTuple(mrfSimpleSection, ':media_nsfw');
        const reportRemoval = getTuple(mrfSimpleSection, ':report_removal');
        const avatarRemoval = getTuple(mrfSimpleSection, ':avatar_removal');
        const bannerRemoval = getTuple(mrfSimpleSection, ':banner_removal');
        const backgroundRemoval = getTuple(mrfSimpleSection, ':background_removal');
        const transparencyExclusions = getTuple(mrfSection, ':transparency_exclusions');

        // Find current blocks
        const existingUnlist = federatedTimelineRemoval.find(t => t.tuple[0] === block.host);
        const existingSuspend = reject.find(t => t.tuple[0] === block.host);
        const existingSilence = followersOnly.find(t => t.tuple[0] === block.host);
        const existingRejectMedia = mediaRemoval.find(t => t.tuple[0] === block.host);
        const existingRejectAvatars = avatarRemoval.find(t => t.tuple[0] === block.host);
        const existingRejectBanners = bannerRemoval.find(t => t.tuple[0] === block.host);
        const existingRejectBackgrounds = backgroundRemoval.find(t => t.tuple[0] === block.host);
        const existingSetNSFW = mediaNSFW.find(t => t.tuple[0] === block.host);
        const existingRejectReports = reportRemoval.find(t => t.tuple[0] === block.host);
        const existingTransparencyExclusions = transparencyExclusions.find(t => t.tuple[0] === block.host);

        // Compute current state
        const isUnlisted = !!existingUnlist;
        const isSuspended = !!existingSuspend;
        const isSilenced = !!existingSilence;
        const isMediaRejected = !!existingRejectMedia;
        const isAvatarRejected = !!existingRejectAvatars;
        const isBannerRejected = !!existingRejectBanners;
        const isBackgroundRejected = !!existingRejectBackgrounds;
        const isSetNSFW = !!existingSetNSFW;
        const isReportRejected = !!existingRejectReports;
        const isTransparencyExcluded = !!existingTransparencyExclusions;
        const hasExistingBlock = isUnlisted || isSuspended || isSilenced || isMediaRejected || isAvatarRejected || isBannerRejected || isBackgroundRejected || isSetNSFW || isReportRejected || isTransparencyExcluded;

        // Compute changes
        const doUnlist = isUnlist && !isUnlisted;
        const doSuspend = isSuspend && !isSuspended;
        const doSilence = isSilence && !isSilenced;
        const doRejectMedia = block.rejectMedia && !isMediaRejected;
        const doRejectAvatars = block.rejectAvatars && !isAvatarRejected;
        const doRejectBanners = block.rejectBanners && !isBannerRejected;
        const doRejectBackgrounds = block.rejectBackgrounds && !isBackgroundRejected;
        const doSetNSFW = block.setNSFW && !isSetNSFW;
        const doRejectReports = block.rejectReports && !isReportRejected;
        const doExcludeTransparency = block.redact && !isTransparencyExcluded;
        const hasBlockChanges = doUnlist || doSuspend || doSilence || doRejectMedia || doRejectAvatars || doRejectBanners || doRejectBackgrounds || doSetNSFW || doRejectReports || doExcludeTransparency;

        // Check for changes
        if (!hasBlockChanges) {
            return 'skipped';
        }

        // Add or update all blocks.
        // (this is kinda gross, should refactor)
        const publicReason = block.publicReason ?? '';

        if (doUnlist)
            federatedTimelineRemoval.push({ tuple: [block.host, publicReason] });
        else if (isUnlisted && publicReason)
            existingUnlist.tuple[1] = publicReason;

        if (doSuspend)
            reject.push({ tuple: [block.host, publicReason] });
        else if (isSuspended && publicReason)
            existingSuspend.tuple[1] = publicReason;

        if (doSilence)
            followersOnly.push({ tuple: [block.host, publicReason] });
        else if (isSilenced && publicReason)
            existingSilence.tuple[1] = publicReason;

        if (doRejectMedia)
            mediaRemoval.push({ tuple: [block.host, publicReason] });
        else if (isMediaRejected && publicReason)
            existingRejectMedia.tuple[1] = publicReason;

        if (doRejectAvatars)
            avatarRemoval.push({ tuple: [block.host, publicReason] });
        else if (isAvatarRejected && publicReason)
            existingRejectAvatars.tuple[1] = publicReason;

        if (doRejectBanners)
            bannerRemoval.push({ tuple: [block.host, publicReason] });
        else if (isBannerRejected && publicReason)
            existingRejectBanners.tuple[1] = publicReason;

        if (doRejectBackgrounds)
            backgroundRemoval.push({ tuple: [block.host, publicReason] });
        else if (isBackgroundRejected && publicReason)
            existingRejectBackgrounds.tuple[1] = publicReason;

        if (doSetNSFW)
            mediaNSFW.push({ tuple: [block.host, publicReason] });
        else if (isSetNSFW && publicReason)
            existingSetNSFW.tuple[1] = publicReason;

        if (doRejectReports)
            reportRemoval.push({ tuple: [block.host, publicReason] });
        else if (isReportRejected && publicReason)
            existingRejectReports.tuple[1] = publicReason;

        // Don't set a reason for transparency - the semantics are different.
        if (doExcludeTransparency)
            transparencyExclusions.push({ tuple: [block.host, ''] });

        // Save changes
        if (!this.config.dryRun) {
            await this.updateConfig({
                configs: [
                    mrfSimpleSection,
                    mrfSection
                ],
                needs_reboot: false
            });
        }

        return hasExistingBlock ? 'updated' : 'created';
    }

    async getMaxPostLength(): Promise<number> {
        const config = await this.getInstance();
        return config.max_toot_chars;
    }

    async publishPost(post: Post): Promise<string> {
        // TODO implement post publish
        return '(error: not implemented)';
    }

    async getSoftware(): Promise<RemoteSoftware> {
        const instance = await this.getInstance();
        return parseVersion(instance.version);
    }

    async getConfig(): Promise<PleromaConfig> {
        return await this.client.getConfig();
    }

    async updateConfig(config: PleromaConfig): Promise<void> {
        await this.client.updateConfig(config);
    }

    async getInstance(): Promise<PleromaInstance> {
        return await this.client.getInstance();
    }
}

// gross
type MRFSection = PleromaConfigSection<Tuple<Tuple<string>[]>[]>;

/**
 * Finds and returns a specified configuration section by group / key.
 */
function findConfigSection(config: PleromaConfig, group: string, key: string): PleromaConfigSection<unknown> {
    const mrfSimple = config.configs.find(c => c.group === group && c.key === key);
    if (!mrfSimple) {
        throw new Error(`Failed to read instance config, can't find ${group}/${key} in the response`);
    }

    return mrfSimple;
}

/**
 * Gets or creates a configuration tuple in the given MRF config.
 * Returns an array of [domain, block reason] tuples for the given category.
 */
function getTuple(config: MRFSection, key: string): Tuple<string>[] {
    // Happy path - it already exists in the config
    for (const entry of config.value) {
        if (entry.tuple[0] === key) {
            return entry.tuple[1];
        }
    }

    // Sad (but most likely) path - it doesn't exist yet, so we need to create it.
    const tupleData: Tuple<string>[] = [];

    // It's *extremely important* that we add the entry back to the original config object!
    // Otherwise, the changes will be detached and not sent back to the server.
    config.value.push({
        tuple: [key, tupleData]
    });

    // We also need to update that "db" property, if it exists.
    config.db?.push(key);

    return tupleData;
}

function parseVersion(version: string): RemoteSoftware {
    // If it doesn't match, then we have no clue.
    // Pass the version field as-is.
    const match = version.match(/([\d.]+)(?: \(compatible; (\w+) ([\d.]+)\))?/);
    if (!match)
        return { name: 'unknown', version: version };

    // If extra fields show up, then those are added by a fork and should be used instead.
    const [_, pleromaVersion, forkName, forkVersion ] = match;
    if (forkName && forkVersion)
        return { name: forkName, version: forkVersion };

    // Otherwise, it's just regular Pleroma.
    return { name: 'Pleroma', version: pleromaVersion };
}

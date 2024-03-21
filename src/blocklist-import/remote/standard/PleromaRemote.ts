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
            return 'excluded';
        }

        // Read the config
        const {
            mrfSimpleSection,
            mrfSection,

            federatedTimelineRemoval,
            reject,
            followersOnly,
            mediaRemoval,
            avatarRemoval,
            bannerRemoval,
            backgroundRemoval,
            mediaNSFW,
            reportRemoval,
            transparencyExclusions
        } = await this.getMRFSections();

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

        // map the federation limit into individuals flags
        const isSuspend = block.limitFederation === 'suspend';
        const isSilence = block.limitFederation === 'suspend' || block.limitFederation === 'silence';
        const isUnlist = block.limitFederation === 'suspend' || block.limitFederation === 'silence' || block.limitFederation === 'unlist';

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
            return 'unchanged';
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

    async getBlocklist(): Promise<Block[]> {
        // Read the config
        const {
            federatedTimelineRemoval,
            reject,
            followersOnly,
            mediaRemoval,
            avatarRemoval,
            bannerRemoval,
            backgroundRemoval,
            mediaNSFW,
            reportRemoval,
            transparencyExclusions
        } = await this.getMRFSections();

        // Pivot from (type -> [host, reason]) to (host -> [type[], reason])
        const allHosts = getAllHosts(federatedTimelineRemoval, reject, followersOnly, mediaRemoval, avatarRemoval, bannerRemoval, backgroundRemoval, mediaNSFW, reportRemoval, transparencyExclusions);
        return allHosts.map(host => ({
            host,
            sources: [ this.host ],

            publicReason: combineTuples(host, federatedTimelineRemoval, reject, followersOnly, mediaRemoval, avatarRemoval, bannerRemoval, backgroundRemoval, mediaNSFW, reportRemoval, transparencyExclusions),
            privateReason: getTupleValue(host, transparencyExclusions),
            redact: isInTuple(host, transparencyExclusions),

            limitFederation:
                isInTuple(host, reject)
                    ? 'suspend'
                    : isInTuple(host, followersOnly)
                        ? 'silence'
                        : isInTuple(host, federatedTimelineRemoval)
                            ? 'unlist'
                            : undefined,
            setNSFW: isInTuple(host, mediaNSFW),

            rejectMedia: isInTuple(host, mediaRemoval),
            rejectAvatars: isInTuple(host, avatarRemoval),
            rejectBanners: isInTuple(host, bannerRemoval),
            rejectBackgrounds: isInTuple(host, backgroundRemoval),
            rejectReports: isInTuple(host, bannerRemoval)
        }));
    }

    private async getMRFSections() {
        // Read config
        const instanceConfig = await this.getConfig();
        const mrfSimpleSection = findConfigSection(instanceConfig, ':pleroma', ':mrf_simple') as MRFSection;
        const mrfSection = findConfigSection(instanceConfig, ':pleroma', ':mrf') as MRFSection;

        return {
            mrfSection,
            mrfSimpleSection,

            // Unpack tuple objects.
            // Each one is a list of [domain, block reason] pairs for a particular category (but in a really weird format).
            federatedTimelineRemoval: getConfigTuple(mrfSimpleSection, ':federated_timeline_removal'),
            reject: getConfigTuple(mrfSimpleSection, ':reject'),
            followersOnly: getConfigTuple(mrfSimpleSection, ':followers_only'),
            mediaRemoval: getConfigTuple(mrfSimpleSection, ':media_removal'),
            mediaNSFW: getConfigTuple(mrfSimpleSection, ':media_nsfw'),
            reportRemoval: getConfigTuple(mrfSimpleSection, ':report_removal'),
            avatarRemoval: getConfigTuple(mrfSimpleSection, ':avatar_removal'),
            bannerRemoval: getConfigTuple(mrfSimpleSection, ':banner_removal'),
            backgroundRemoval: getConfigTuple(mrfSimpleSection, ':background_removal'),
            transparencyExclusions: getConfigTuple(mrfSection, ':transparency_exclusions')
        };
    }

    protected async getConfig(): Promise<PleromaConfig> {
        return await this.client.getConfig();
    }

    protected async updateConfig(config: PleromaConfig): Promise<void> {
        await this.client.updateConfig(config);
    }

    protected async getInstance(): Promise<PleromaInstance> {
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
function getConfigTuple(config: MRFSection, key: string): Tuple<string>[] {
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

function getAllHosts(federatedTimelineRemoval: Tuple<string>[], reject: Tuple<string>[], followersOnly: Tuple<string>[], mediaRemoval: Tuple<string>[], avatarRemoval: Tuple<string>[], bannerRemoval: Tuple<string>[], backgroundRemoval: Tuple<string>[], mediaNSFW: Tuple<string>[], reportRemoval: Tuple<string>[], transparencyExclusions: Tuple<string>[]): string[] {
    const hosts = [federatedTimelineRemoval, reject, followersOnly, mediaRemoval, avatarRemoval, bannerRemoval, backgroundRemoval, mediaNSFW, reportRemoval, transparencyExclusions]
        .flat(2)
        .map(t => t.tuple[0]);

    return Array.from(new Set(hosts));
}

/**
 * Find all tuples for the provided host, then concat all unique values.
 */
function combineTuples(host: string, ...tuples: Tuple<string>[][]): string | undefined {
    return tuples
        .flat()
        .map(t => t.tuple)
        .filter(t => t[0] === host)
        .reduce((merged, [_,next]) => {
            if (!merged)
                return next;
            if (merged.includes(next))
                return merged;
            return `${merged} | ${next}`;

        }, undefined as string | undefined)
}

function getTupleValue(host: string, tuple: Tuple<string>[]): string | undefined {
    return tuple
        .find(t => t.tuple[0] === host)
        ?.tuple[1];
}

function isInTuple(host: string, tuple: Tuple<string>[]): boolean {
    return tuple.some(t => t.tuple[0] === host);
}

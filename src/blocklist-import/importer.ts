import {AnnouncementConfig, Config, defaultAnnouncementConfig, SourceConfig} from "./domain/config.js";
import {createRemote, Remote} from "./remote/remote.js";
import {Block, FederationLimit} from "./domain/block.js";
import {readSource} from "./source/source.js";
import {SharkeyRemote} from "./remote/SharkeyRemote.js";
import {AnnouncementBuilder} from "./announcement/AnnouncementBuilder.js";
import {renderAnnouncement} from "./announcement/renderAnnouncement.js";
import {Post} from "./domain/post.js";

export async function importBlocklist(config: Config): Promise<void> {
    if (config.sources.length < 1) {
        console.info('No source lists defined - exiting.')
        return;
    }

    if (config.remotes.length < 1) {
        console.info('No remotes defined - exiting.');
        return;
    }

    if (config.retractBlocks) {
        console.warn('Ignoring retractBlocks - retraction is not implemented.');
    }

    if (typeof(config.generateAnnouncements) === 'object' && config.generateAnnouncements.publishPosts) {
        console.warn('Ignoring publishPosts - publish is not implemented');
    }

    if (config.dryRun) {
        console.info('Dry run requested - blocks will not be saved.');
    }

    // Construct remote clients
    const remotes = config.remotes
        .map(remote => createRemote(remote, config));

    // Load blocklists
    const blocks = await loadBlocks(config.sources);
    if (blocks.length > 0)
        console.info(`Loaded ${blocks.length} unique block(s) from ${config.sources.length} source list(s).`);
    else
        console.warn('No blocks were loaded - please check the script config and source lists.');
    console.info('');

    // Do the import
    await importBlocksToRemotes(blocks, remotes);

    // Create announcement posts
    await generateAnnouncements(remotes, config);

    // Print results
    printStats(remotes);
    printWarnings(remotes, config);
}

async function loadBlocks(sources: SourceConfig[]): Promise<Block[]> {
    const uniqueBlocks = new Map<string, Block>();

    for (const source of sources) {
        const sourceBlocks = await readSource(source)

        for (const block of sourceBlocks) {
            const duplicateBlock = uniqueBlocks.get(block.host);

            if (duplicateBlock) {
                console.info(`Merging duplicate block entries for ${block.host}. (found in sources "${block.source}" and "${duplicateBlock.source}")`);

                block.publicReason = `${block.publicReason} | ${duplicateBlock.publicReason}`;
                block.privateReason = `${block.privateReason} | ${duplicateBlock.privateReason}`;
                block.redact ||= duplicateBlock.redact;
                block.limitFederation = mergeLimits(block.limitFederation, duplicateBlock.limitFederation);
                block.setNSFW ||= duplicateBlock.setNSFW;
                block.rejectMedia ||= duplicateBlock.rejectMedia;
                block.rejectAvatars ||= duplicateBlock.rejectAvatars;
                block.rejectBanners ||= duplicateBlock.rejectBanners;
                block.rejectBackgrounds ||= duplicateBlock.rejectBackgrounds;
                block.rejectReports ||= duplicateBlock.rejectReports;
            }

            uniqueBlocks.set(block.host, block);
        }
    }

    return Array.from(uniqueBlocks.values());
}

function mergeLimits(first: FederationLimit | undefined, second: FederationLimit | undefined): FederationLimit | undefined {
    // suspend > silence > unlist > disconnect > nothing

    if (first === 'suspend' || second === 'suspend') return 'suspend';
    if (first === 'silence' || second === 'silence') return 'silence';
    if (first === 'unlist' || second === 'unlist') return 'unlist';
    if (first === 'ghost' || second === 'ghost') return 'ghost';

    return undefined;
}

async function importBlocksToRemotes(blocks: Block[], remotes: Remote[]): Promise<void> {
    console.info('#################################################');
    console.info('#              Applying all blocks              #');
    console.info('#################################################');
    console.info();
    console.info(`Running matrix of ${blocks.length} blocks across ${remotes.length} remotes.`);
    if (remotes.some(r => r instanceof SharkeyRemote)) {
        console.info('This may take a while, please be patient.')   
    }
    console.info();

    for (const block of blocks) {
        const actions = getBlockActions(block);
        if (actions.length > 0) {
            const actionString = concatBlockActions(actions);
            const ending = block.redact ? ' (redacted).' : '.';
            console.info(`${block.host}: ${actionString} for "${block.publicReason}"${ending}`);
        } else {
            console.warn(`${block.host}: no actions defined, block will be skipped.`);
            continue;
        }

        for (const remote of remotes) {
            try {
                const result = await remote.tryApplyBlock(block);

                if (result === 'created') {
                    console.info(`  created block on ${remote.host}.`);

                } else if (result === 'updated') {
                    console.info(`  updated block on ${remote.host}.`);

                } else if (result === 'unsupported') {
                    console.info(`  skipped ${remote.host} - does not support this block.`);

                } else {
                    console.info(`  skipped ${remote.host} - already blocks this domain.`);
                }
            } catch (e) {
                console.error(`  failed ${remote.host} - an error was thrown:`, e);
            }
        }

        console.info('');
    }
}

function getBlockActions(block: Block): string[] {
    const actions: string[] = [];
    if (block.limitFederation) actions.push(block.limitFederation);
    if (block.setNSFW) actions.push('set NSFW');
    if (block.rejectMedia) actions.push('reject media');
    if (block.rejectAvatars) actions.push('reject avatars');
    if (block.rejectBanners) actions.push('reject banners');
    if (block.rejectBackgrounds) actions.push('reject backgrounds');
    if (block.rejectReports) actions.push('reject reports');
    return actions;
}

function concatBlockActions(actions: string[]): string {
    // A single action.
    if (actions.length < 2)
        return actions[0];

    // Two actions: format as "this and that".
    if (actions.length === 2)
        return actions.join(' and ');

    // Three+ actions: format as "this, that, and the other".
    const first = actions.slice(0, -1).join(', ');
    return `${first}, and ${actions.at(-1)}`;
}

async function generateAnnouncements(remotes: Remote[], config: Config): Promise<void> {
    // Normalize config and bail if disabled.
    const announcementConfig = readAnnouncementConfig(config);
    if (!announcementConfig.enabled) {
        return;
    }

    console.info('#################################################');
    console.info('#            Generating announcements           #');
    console.info('#################################################');
    console.info();

    if (announcementConfig.publishPosts) {
        console.info('You have enabled "publishPosts", so announcements will be automatically posted using the linked account(s).');
    } else {
        console.info('You have disabled "publishPosts", so announcements will be printed to the console in Markdown format.');
        console.info('Each announcement will be broken down into individual posts to fit within the character limit.');
    }

    const builder = new AnnouncementBuilder(announcementConfig);
    for (const remote of remotes) {
        console.info();

        // Don't make an announcement if nothing was blocked
        if (remote.stats.createdBlocks.length === 0 && remote.stats.updatedBlocks.length === 0) {
            console.info(`Skipping announcement thread for ${remote.host}; no blocks were changed so there is nothing to announce.`);
            continue;
        }

        // Create a semantic announcement
        const announcement = builder.createAnnouncement(remote);

        // Render it into a raw post
        const maxLength = await remote.getMaxPostLength();
        const post = renderAnnouncement(announcement, maxLength);

        if (config.dryRun) {
            // Print announcement
            console.info(`Generated announcement thread for ${remote.host}:`);
            console.info();
            printPost(post);
            console.info('[End]');

        } else {
            // Post announcement
            const postUrl = await remote.publishPost(post);
            console.info(`${remote.host}: posted announcement to ${postUrl}.`);
        }
    }

    console.info('');
}

function readAnnouncementConfig(fullConfig: Config): AnnouncementConfig {
    let config: Partial<AnnouncementConfig>;

    if (typeof(fullConfig.generateAnnouncements) === 'object') {
        config = fullConfig.generateAnnouncements;
    } else {
        config = { enabled: fullConfig.generateAnnouncements === true };
    }

    return Object.assign(defaultAnnouncementConfig, config);
}

function printPost(post: Post, prefix?: string, index: number = 0): void {
    const subPrefix = prefix
        ? `${prefix}.${index + 1}`
        : (index + 1).toString();

    // Print the post header and contents
    const type = prefix ? 'Reply' : 'Post';
    console.info(`[${type} ${subPrefix}]`);
    console.info(post.text);

    // Print replies
    for (let subIndex = 0; subIndex < post.replies.length; subIndex++){
        const reply = post.replies[subIndex];
        printPost(reply, subPrefix, subIndex);
    }
}

function printStats(remotes: Remote[]): void {
    console.info('#################################################');
    console.info('#                Import complete                #');
    console.info('#################################################');
    console.info();

    // Count the number of characters per column in the output, for pretty-printing.
    const remoteHostWidth = remotes.reduce((max, remote) => Math.max(max, remote.host.length), 0);
    const createdBlocksWidth = remotes.reduce((max, remote) => Math.max(max, remote.stats.createdBlocks.length.toString().length), 0);
    const updatedBlocksWidth = remotes.reduce((max, remote) => Math.max(max, remote.stats.updatedBlocks.length.toString().length), 0);
    const lostFollowsWidth = remotes.reduce((max, remote) => Math.max(max, remote.stats.lostFollows?.toString().length ?? 1), 0);
    const lostFollowersWidth = remotes.reduce((max, remote) => Math.max(max, remote.stats.lostFollowers?.toString().length ?? 1), 0);

    console.info('Final results for each remote:')
    for (const remote of remotes) {
        const remoteHost = `${remote.host}:`.padEnd(remoteHostWidth + 1, ' ');
        const createdBlocks = remote.stats.createdBlocks.length.toString().padStart(createdBlocksWidth);
        const updatedBlocks = remote.stats.updatedBlocks.length.toString().padStart(updatedBlocksWidth);
        const lostFollows = (remote.stats.lostFollows?.toString() ?? '?' ).padStart(lostFollowsWidth);
        const lostFollowers = (remote.stats.lostFollowers?.toString() ?? '?').padStart(lostFollowersWidth);

        let statMessage = remote.stats.lostFollows !== undefined || remote.stats.lostFollowers !== undefined
            ? `  ${remoteHost} applied ${createdBlocks} new and ${updatedBlocks} updated blocks, losing ${lostFollows} outward and ${lostFollowers} inward connections.`
            : `  ${remoteHost} applied ${createdBlocks} new and ${updatedBlocks} updated blocks.`;

        if (remote.stats.unsupportedBlocks.length > 0) {
            statMessage += ` ${remote.stats.unsupportedBlocks.length} blocks were unsupported and not applied.`;
        }

        console.info(statMessage);
    }

    console.info('');
}

function printWarnings(remotes: Remote[], config: Config): void {
    const warnings: string[] = [];

    // Print a warning if any blocks were unsupported
    if (remotes.some(r => r.stats.unsupportedBlocks.length > 0)) {
        warnings.push('Some blocks could not be applied to all instances. See the above logs for details.');
    }

    // Print a warning if this was a dry run
    if (config.dryRun) {
        warnings.push('This was a dry run. Blocks are not actually applied.');
    }

    if (warnings.length > 0) {
        for (const warning of warnings) {
            console.warn(`warning: ${warning}`);
        }

        console.info('');
    }
}

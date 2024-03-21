import {Config} from "./domain/config.js";
import {Remote} from "./remote/Remote.js";
import {Block, FederationLimit} from "./domain/block.js";
import {readSource, Source} from "./source/source.js";
import {AnnouncementBuilder} from "./announcement/AnnouncementBuilder.js";
import {renderAnnouncement} from "./announcement/renderAnnouncement.js";
import {Post} from "./domain/post.js";
import {createRemote} from "./remote/createRemote.js";
import {BlockAction, FollowRelation} from "./domain/blockResult.js";

export async function importBlocklist(config: Config): Promise<void> {
    const { remotes, blocks } = await setup(config);

    if (blocks.length < 1) {
        console.warn('No blocks were loaded, please check your configuration and lists.');
        console.warn('exiting.');
        return;
    }

    if (remotes.length < 1) {
        console.warn('No remotes defined, please check your configuration.');
        console.warn('exiting.');
        return;
    }

    // Do the import
    await importBlocksToRemotes(config, remotes, blocks);

    // Create announcement posts
    await generateAnnouncements(config, remotes);

    // Print results
    printStats(config, remotes);
    printFinalWarnings(config, remotes);
}

async function setup(config: Config): Promise<{ remotes: Remote[], blocks: Block[] }> {
    console.info('#################################################');
    console.info('#                 Initializing                  #');
    console.info('#################################################');
    console.info();

    // Construct remote clients
    const remotes = config.remotes.map(remote =>
        createRemote(remote, config)
    );

    // Initialize all remotes in parallel
    console.info('Connecting to remote instances:');
    const remoteSoftware = await Promise.all(
        remotes.map(async remote => {
            if (remote.initialize) {
                await remote.initialize();
            }

            const { name, version } = await remote.getSoftware();
            return {
                host: remote.host,
                name,
                version
            };
        })
    );
    for (const {host, name, version} of remoteSoftware) {
        console.info(`  ${host}: connected to ${name} version ${version}.`);
    }
    console.info();

    // Print warnings
    const warnings: string[] = [];
    if (config.retractBlocks)
        warnings.push('Ignoring retractBlocks - retraction is not implemented.')
    if (typeof(config.announcements) === 'object' && config.announcements.publishPosts)
        warnings.push('Ignoring publishPosts - publish is not implemented')
    if (config.dryRun)
        warnings.push('Dry run requested - blocks will not be saved.');
    if (config.fastMode)
        warnings.push('Fast Mode is enabled. This will greatly speed up the process, but the remote instances will be in an inconsistent state until the script finishes. Do not attempt to manually adjust any remote blocks while the script is running!');
    if (config.preserveConnections && remotes.some(r => !r.tracksFollowers || !r.tracksFollowers))
        warnings.push('warning: Preserve Connections is enabled, but one or more remotes does not support it and will process all blocks.');
    if (remotes.some(r =>
        (r.seversFollows && (!config.preserveConnections || !r.tracksFollows)) ||
        (r.seversFollowers && (!config.preserveConnections || !r.tracksFollowers))
    ))
        warnings.push('warning: One or more remotes is using software that will *permanently* sever existing follow relations when a block is processed. The changes may be irreversible.');
    printWarnings(warnings);

    // TODO add pause before continuing if there are warnings

    // Load blocklists
    console.info('Loading all defined blocks:')
    const sources = getSources(config, remotes);
    const blocks = await loadBlocks(config, sources);

    const blockPlural = blocks.length === 1 ? '' : 's';
    const listPlural = sources.length === 1 ? '' : 's';
    console.info(`Loaded ${blocks.length} unique block${blockPlural} from ${sources.length} source list${listPlural}.`);
    console.info('');

    return { remotes, blocks };
}

function getSources(config: Config, remotes: Remote[]): Source[] {
    let sources: Source[] = config.sources;

    if (config.crossSync) {
        const remoteSources: Source[] = remotes.map(remote => ({ type: 'remote', remote }));
        sources = remoteSources.concat(sources);
    }

    return sources;
}

async function loadBlocks(config: Config, sources: Source[]): Promise<Block[]> {
    // Load all blocks in parallel
    const blockLists = await Promise.all(
        sources.map(s => readSource(s))
    );

    // Merge and flatten
    const uniqueBlocks = new Map<string, Block>();

    for (const list of blockLists) {
        for (const block of list) {
            const duplicateBlock = uniqueBlocks.get(block.host);

            if (duplicateBlock) {
                const sources = Array.from(new Set(block.sources.concat(duplicateBlock.sources)));

                if (config.printMergedBlocks) {
                    const sourceList = sources.join(', ');
                    console.info(`  Merging duplicate block entries for ${block.host}. (found in sources: ${sourceList})`);
                }

                block.sources = sources;

                block.publicReason = mergeReasons(block.publicReason, duplicateBlock.publicReason);
                block.privateReason = mergeReasons(block.privateReason, duplicateBlock.privateReason);
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

function mergeReasons(first: string | undefined, second: string | undefined): string | undefined {
    // If both are present, then we need to merge.
    if (first && second)
        return `${first} | ${second}`;

    // Otherwise, we just take whichever is present (possibly neither).
    return first || second;
}

function mergeLimits(first: FederationLimit | undefined, second: FederationLimit | undefined): FederationLimit | undefined {
    // suspend > silence > unlist > disconnect > nothing

    if (first === 'suspend' || second === 'suspend') return 'suspend';
    if (first === 'silence' || second === 'silence') return 'silence';
    if (first === 'unlist' || second === 'unlist') return 'unlist';
    if (first === 'ghost' || second === 'ghost') return 'ghost';

    return undefined;
}

async function importBlocksToRemotes(config: Config, remotes: Remote[], blocks: Block[]): Promise<void> {
    console.info('#################################################');
    console.info('#              Applying all blocks              #');
    console.info('#################################################');
    console.info();

    console.info(`Running matrix of ${blocks.length} blocks across ${remotes.length} remotes.`);
    console.info('This may take a while, please be patient.');
    console.info();

    for (const block of blocks) {
        const actions = getBlockActions(block);
        if (actions.length > 0) {
            const actionString = concatBlockActions(actions);
            const ending = block.redact ? ' (redacted)' : '';

            if (block.publicReason && block.privateReason) {
                console.info(`${block.host}: ${actionString} for "${block.publicReason}" with note "${block.privateReason}"${ending}.`);

            } else if (block.publicReason) {
                console.info(`${block.host}: ${actionString} for "${block.publicReason}"${ending}.`);

            } else if (block.privateReason) {
                console.info(`${block.host}: ${actionString} with note "${block.privateReason}"${ending}.`);

            } else {
                console.info(`${block.host}: ${actionString} without reason or note${ending}.`);
            }
        } else {
            console.warn(`${block.host}: no actions defined, block will be skipped.`);
            continue;
        }

        // Apply blocks in parallel
        const remoteResults = await Promise.all(
            remotes.map(async remote => ({
                remote,
                result: await remote.tryApplyBlock(block)
            }))
        );

        // Process all results
        for (const { remote, result } of remoteResults) {
            const { action, lostFollows, lostFollowers, error } = result;

            if (error) {
                console.error(`  failed ${remote.host} - an error was thrown:`, error);

            } else {
                const actionMessage = getBlockActionMessage(action, remote.host);
                const lossMessage = getBlockLossMessage(remote, lostFollows, lostFollowers);

                if (lossMessage)
                    console.info(`  ${actionMessage} and ${lossMessage}.`);
                else
                    console.info(`  ${actionMessage}.`);

                if (config.printLostConnections) {
                    printLostRelations(remote.tracksFollows, remote.seversFollows, 'outward', lostFollows);
                    printLostRelations(remote.tracksFollowers, remote.seversFollowers, 'inward', lostFollowers);
                }
            }
        }

        console.info('');
    }

    console.info('Done; all blocks have been processed.');
    console.info();

    if (remotes.some(r => r.commit)) {
        console.info('Saving final changes:');

        // Save changes in parallel
        const savedHosts = await Promise.all(
            remotes.map(async remote => {
                if (remote.commit) {
                    await remote.commit();
                }

                return remote.host;
            })
        );

        for (const host of savedHosts) {
            console.info(`  ${host}: all changes saved.`);
        }

        console.info();
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

function getBlockActionMessage(action: BlockAction, host: string): string {
    if (action === 'created') {
        return `Created block on ${host}`;

    } else if (action === 'updated') {
        return `Updated block on ${host}`;

    } else if (action === 'excluded') {
        return `Excluded ${host} - block is unsupported or excluded by settings`;

    } else if (action === 'unchanged') {
        return `Skipped ${host} - already blocks this domain`;

    } else {
        throw new Error(`Unknown BlockAction: ${action}`);
    }
}

function getBlockLossMessage(remote: Remote, lostFollows: number | FollowRelation[] | undefined, lostFollowers: number | FollowRelation[] | undefined): string | undefined {
    // Flatten these down into number | undefined.
    // This allows us to just test for truthiness.
    if (Array.isArray(lostFollows))
        lostFollows = lostFollows.length;
    if (Array.isArray(lostFollowers))
        lostFollowers = lostFollowers.length;

    // These can potentially be different.
    const followsLossType = remote.seversFollows
        ? 'severed'
        : 'paused';
    const followersLossType = remote.seversFollowers
        ? 'severed'
        : 'paused';

    const followsPlural = lostFollows === 1 ? '' : 's';
    const followersPlural = lostFollowers === 1 ? '' : 's';

    if (lostFollows && lostFollowers) {
        return (followsLossType === followersLossType)
            ? `${followsLossType} ${lostFollows} outward and ${lostFollowers} inward follow relationships`
            : `${followsLossType} ${lostFollows} outward follow relationship${followsPlural} + ${followersLossType} ${lostFollowers} inward follow relationship${followersPlural}`
    }

    if (lostFollows) {
        return `${followsLossType} ${lostFollows} outward follow relationship${followsPlural}`;
    }

    if (lostFollowers) {
        return `${followersLossType} ${lostFollowers} inward follow relationship${followersPlural}`;
    }

    // It's possible (even likely) for there to be no loss at all.
    return undefined;
}

function printLostRelations(isTracked: boolean, isSevered: boolean, direction: string, lostRelations: number | FollowRelation[] | undefined) {
    if (isTracked && Array.isArray(lostRelations)) {
        const followerLossType = isSevered ? 'Severed' : 'Paused';

        for (const { follower, followee } of lostRelations) {
            console.info(`    ${followerLossType} ${direction} follow relationship from ${follower} to ${followee}.`);
        }
    }
}

async function generateAnnouncements(config: Config, remotes: Remote[]): Promise<void> {
    if (!config.announcements.enabled) {
        return;
    }

    console.info('#################################################');
    console.info('#            Generating announcements           #');
    console.info('#################################################');
    console.info();

    if (config.announcements.publishPosts) {
        const plural = remotes.length === 1 ? '' : 's';
        console.info(`You have enabled "publishPosts", so announcements will be automatically posted using the linked account${plural}.`);
    } else {
        console.info('You have disabled "publishPosts", so announcements will be printed to the console in Markdown format.');
        console.info('Each announcement will be broken down into individual posts to fit within the character limit.');
    }

    const builder = new AnnouncementBuilder(config.announcements);
    for (const remote of remotes) {
        console.info();

        // Don't make an announcement if nothing was blocked
        if (remote.getCreatedBlocks().length === 0 && remote.getUpdatedBlocks().length === 0) {
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

function printStats(config: Config, remotes: Remote[]): void {
    console.info('#################################################');
    console.info('#                Import complete                #');
    console.info('#################################################');
    console.info();

    // Count the number of characters per column in the output, for pretty-printing.
    const remoteHostWidth = remotes.reduce((max, remote) => Math.max(max, remote.host.length), 0);
    const createdBlocksWidth = remotes.reduce((max, remote) => Math.max(max, remote.getCreatedBlocks().length.toString().length), 0);
    const updatedBlocksWidth = remotes.reduce((max, remote) => Math.max(max, remote.getUpdatedBlocks().length.toString().length), 0);
    const lostFollowsWidth = remotes.reduce((max, remote) => Math.max(max, remote.getLostFollowsCount()?.toString().length ?? 1), 0);
    const lostFollowersWidth = remotes.reduce((max, remote) => Math.max(max, remote.getLostFollowersCount()?.toString().length ?? 1), 0);

    console.info('Final results for each remote:')
    for (const remote of remotes) {
        const createdBlocksCount = remote.getCreatedBlocks().length;
        const updateBlocksCount = remote.getUpdatedBlocks().length;
        const lostFollowsCount = remote.getLostFollowsCount() ?? 0;
        const lostFollowersCount = remote.getLostFollowersCount() ?? 0;

        const remoteHost = `${remote.host}:`.padEnd(remoteHostWidth + 1, ' ');
        const createdBlocks = createdBlocksCount.toString().padStart(createdBlocksWidth);
        const updatedBlocks = updateBlocksCount.toString().padStart(updatedBlocksWidth);
        const lostFollows = (lostFollowsCount?.toString() ?? '?' ).padStart(lostFollowsWidth);
        const lostFollowers = (lostFollowersCount?.toString() ?? '?').padStart(lostFollowersWidth);

        let statMessage = lostFollowsCount > 0 || lostFollowersCount > 0
            ? `  ${remoteHost} Applied ${createdBlocks} new and ${updatedBlocks} updated blocks, losing ${lostFollows} outward and ${lostFollowers} inward follow relations.`
            : `  ${remoteHost} Applied ${createdBlocks} new and ${updatedBlocks} updated blocks.`;

        const excludedBlocksCount = remote.getExcludedBlocks().length;
        const excludedPlural = excludedBlocksCount === 1 ? '' : 's';
        if (excludedBlocksCount > 0) {
            statMessage += ` ${excludedBlocksCount} block${excludedPlural} were excluded due to errors, unsupported flags, or potential for lost connections.`;
        }

        console.info(statMessage);

        // Lost follows, if enabled, have to go on a separate line because they will print out full details.
        if (config.printLostConnections) {
            const lossPerHost = remote.getCreatedBlocks()
                .concat(remote.getUpdatedBlocks())
                .map(({ block: { host }, lostFollows, lostFollowers}) => {
                    let totalLoss = 0;

                    if (lostFollows) {
                        totalLoss += Array.isArray(lostFollows)
                            ? lostFollows.length
                            : lostFollows
                    }

                    if (lostFollowers) {
                        totalLoss += Array.isArray(lostFollowers)
                            ? lostFollowers.length
                            : lostFollowers
                    }

                    return { host, totalLoss };
                })
                .filter(br => br.totalLoss > 0)
                .sort((a, b) => a.host.localeCompare(b.host));

            const lossWidth = lossPerHost.reduce((max, {totalLoss}) => Math.max(max, totalLoss.toString().length), 0);

            const indent = ''.padStart(remoteHostWidth + 6);
            const action = remote.seversFollows || remote.seversFollowers ? 'Severed' : 'Paused';

            for (const entry of lossPerHost) {
                const loss = entry.totalLoss.toString().padStart(lossWidth);
                const plural = entry.totalLoss === 1 ? '' : 's';

                console.info(`${indent}${action} ${loss} follow relation${plural} with ${entry.host}.`);
            }
        }
    }

    console.info('');
}

function printFinalWarnings(config: Config, remotes: Remote[]): void {
    const warnings: string[] = [];

    // Print a warning if any blocks were excluded
    if (remotes.some(r => r.getExcludedBlocks().length > 0)) {
        warnings.push('Some blocks could not be applied to all instances. See the above logs for details.');

        if (config.preserveConnections && !config.dryRun) {
            warnings.push('Current settings may have obscured some details. Consider re-running with "dryRun: true" and "preserveConnections: false" to see details about impacted follow relations');
        }
    }

    // Print a warning if any follows were lost
    if (remotes.some(r => (r.getLostFollowsCount() ?? 0 > 0) || (r.getLostFollowersCount() ?? 0 > 0))) {
        warnings.push('Some remotes have lost follow relations. See the above logs for details.')
    }

    // Print a warning if this was a dry run
    if (config.dryRun) {
        warnings.push('This was a dry run. Blocks are not actually applied.');
    }

    printWarnings(warnings);
}

function printWarnings(warnings: string[]): void {
    if (warnings.length > 0) {
        for (const warning of warnings) {
            console.warn(`warning: ${warning}`);
        }

        console.info('');
    }
}

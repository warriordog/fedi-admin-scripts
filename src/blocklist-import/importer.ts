import {Config, SourceConfig} from "./domain/config.js";
import {createRemote, Remote} from "./remote/remote.js";
import {Block} from "./domain/block.js";
import {readSource} from "./source/source.js";

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

    // Do the import
    await importBlocksToRemotes(blocks, remotes);
}

async function importBlocksToRemotes(blocks: Block[], remotes: Remote[]): Promise<void> {
    // Apply all blocks to all instances
    for (const block of blocks) {
        console.info('');

        const actions = getBlockActions(block);
        if (actions.length > 0) {
            const actionString = concatBlockActions(actions);
            const ending = block.redact ? ' (redacted).' : '.';
            console.info(`${block.host}: ${actionString} for "${block.reason}"${ending}`);
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

                } else if (result === 'ignored') {
                    console.info(`  skipped ${remote.host} - does not support this block.`);

                } else {
                    console.info(`  skipped ${remote.host} - already blocks this domain.`);
                }
            } catch (e) {
                console.error(`  failed ${remote.host} - an error was thrown:`, e);
            }
        }

    }

    console.info('');
}

function getBlockActions(block: Block): string[] {
    const actions = [];
    if (block.suspend) actions.push('suspend');
    if (block.silence) actions.push('silence');
    if (block.unlist) actions.push('unlist');
    if (block.disconnect) actions.push('disconnect');
    if (block.rejectMedia) actions.push('reject media');
    if (block.rejectAvatars) actions.push('reject avatars');
    if (block.rejectBanners) actions.push('reject banners');
    if (block.rejectBackgrounds) actions.push('reject backgrounds');
    if (block.rejectReports) actions.push('reject reports');
    if (block.setNSFW) actions.push('set NSFW');
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

async function loadBlocks(sources: SourceConfig[]): Promise<Block[]> {
    const uniqueBlocks = new Map<string, Block>();

    for (const source of sources) {
        const sourceBlocks = await readSource(source)

        for (const block of sourceBlocks) {
            const duplicateBlock = uniqueBlocks.get(block.host);

            if (duplicateBlock) {
                console.info(`Merging duplicate block entries for ${block.host}.`);
                block.reason = `${block.reason} | ${duplicateBlock.reason}`;
                block.suspend ||= duplicateBlock.suspend;
                block.silence ||= duplicateBlock.silence;
                block.unlist ||= duplicateBlock.unlist;
                block.disconnect ||= duplicateBlock.disconnect;
                block.rejectMedia ||= duplicateBlock.rejectMedia;
                block.rejectAvatars ||= duplicateBlock.rejectAvatars;
                block.rejectBanners ||= duplicateBlock.rejectBanners;
                block.rejectBackgrounds ||= duplicateBlock.rejectBackgrounds;
                block.rejectReports ||= duplicateBlock.rejectReports;
                block.redact ||= duplicateBlock.redact;
                block.setNSFW ||= duplicateBlock.setNSFW;
            }

            uniqueBlocks.set(block.host, block);
        }
    }

    return Array.from(uniqueBlocks.values());
}

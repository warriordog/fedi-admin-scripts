import {Block} from "../domain/block.js";
import {Post} from "../domain/post.js";
import {BlockAction, BlockResult, FollowRelation} from "../domain/blockResult.js";
import {SemiPartial} from "../../common/util/typeUtils.js";

export abstract class Remote {
    /**
     * Hostname of this remote.
     */
    abstract readonly host: string;

    /**
     * True if the instance tracks outward follow relations.
     * An outward follow relation is a local user who follows a remote user.
     *
     * If false, then the value of getLostFollows() and getLostFollowsCount() will be inaccurate.
     */
    abstract readonly tracksFollows: boolean;

    /**
     * True if the instance tracks inward follow relations.
     * An inward follow relation is a remote user who follows a local user.
     *
     * If false, then the value of getLostFollowers() and getLostFollowersCount() will be inaccurate.
     */
    abstract readonly tracksFollowers: boolean;

    /**
     * True if lost outward follow relations will be completely severed (unrecoverable).
     * An outward follow relation is a local user who follows a remote user.
     */
    abstract readonly seversFollows: boolean;

    /**
     * True if lost inward follow relations will be completely severed (unrecoverable).
     * An inward follow relation is a remote user who follows a local user.
     */
    abstract readonly seversFollowers: boolean;

    /**
     * Results of all blocks that have been attempted so far.
     */
    protected readonly blockResults: BlockResult[] = [];

    /**
     * Returns all blocks that have been newly created.
     */
    getCreatedBlocks(): BlockResult[] {
        return this.blockResults.filter(r => r.action === 'created');
    }

    /**
     * Returns all blocks that already existed, but were updated.
     */
    getUpdatedBlocks(): BlockResult[] {
        return this.blockResults.filter(r => r.action === 'updated');
    }

    /**
     * Returns all blocks that could not be processed due to errors or unsupported flags.
     */
    getUnsupportedBlocks(): BlockResult[] {
        return this.blockResults.filter(r => r.action === 'unsupported');
    }

    /**
     * Returns a list of all outward follow relations that were lost due to new or updated blocks.
     * An outward follow relation is a local user who follows a remote user.
     *
     * Will return an empty array if the instance does not track follow relation details.
     * For an accurate count, see getLostFollowsCount().
     */
    getLostFollows(): FollowRelation[] {
        return this.blockResults
            .map(b => b.lostFollows)
            .filter(l => Array.isArray(l))
            .flat() as FollowRelation[];
    }

    /**
     * Returns a list of all inward follow relations that were lost due to new or updated blocks.
     * An inward follow relation is a local user who follows a remote user.
     *
     * Will return an empty array if the instance does not track follow relation details.
     * For an accurate count, see getLostFollowersCount().
     */
    getLostFollowers(): FollowRelation[] {
        return this.blockResults
            .map(b => b.lostFollowers)
            .filter(l => Array.isArray(l))
            .flat() as FollowRelation[];
    }

    /**
     * Returns the number of outward follow relations that were lost due to new or updated blocks.
     * An outward follow relation is a local user who follows a remote user.
     * Returns undefined if the instance does not track this info.
     */
    getLostFollowsCount(): number | undefined {
        if (!this.tracksFollows) {
            return undefined;
        }

        return this.blockResults
            .map(b =>
                Array.isArray(b.lostFollows)
                    ? b.lostFollows.length
                    : b.lostFollows ?? 0
            )
            .reduce((sum, num) => sum + num, 0);
    }

    /**
     * Returns the number of inward follow relations that were lost due to new or updated blocks.
     * An inward follow relation is a remote user who follows a local user.
     * Returns undefined if the instance does not track this info.
     */
    getLostFollowersCount(): number | undefined {
        if (!this.tracksFollowers) {
            return undefined;
        }

        return this.blockResults
            .map(b =>
                Array.isArray(b.lostFollowers)
                    ? b.lostFollowers.length
                    : b.lostFollowers ?? 0
            )
            .reduce((sum, num) => sum + num, 0);
    }

    /**
     * Attempts to apply the provided block to the instance, returning the result of the operation.
     * Subclasses should *not* override this, as it contains the statistic tracking logic.
     * @param block Block to apply
     */
    async tryApplyBlock(block: Block): Promise<BlockResult> {
        try {
            let partialResult = await this.applyBlock(block);

            // Normalize the partial result to be full and well-formed
            if (typeof(partialResult) === 'string') {
                partialResult = { block, action: partialResult, lostFollows: 0, lostFollowers: 0, error: undefined };

            } else if (!partialResult.block) {
                partialResult.block = block;
            }

            const result = partialResult as BlockResult;
            this.blockResults.push(result);
            return result;

        } catch (e) {
            const result: BlockResult = {
                block,
                action: 'unsupported',
                lostFollows: 0,
                lostFollowers: 0,
                error: e as Error
            };
            this.blockResults.push(result);
            return result;
        }
    }

    /**
     Attempts to apply the provided block to the instance, returning the result of the operation.
     Subclasses should override this to provide the implementation.
     @param block Block to apply
     */
    protected abstract applyBlock(block: Block): Promise<PartialBlockResult>;

    /**
     * Returns the maximum length of a post that this remote will accept.
     * Measured in characters.
     */
    abstract getMaxPostLength(): Promise<number>;

    /**
     * Publishes a post from the current user's account.
     * @returns URL of the uploaded post.
     */
    abstract publishPost(post: Post): Promise<string>;

    /**
     * Returns information about the remote's software
     */
    abstract getSoftware(): Promise<RemoteSoftware>;

    /**
     * Loads any common data that will be needed for import.
     * Will be called at the beginning of processing.
     */
    initialize?(): Promise<void>;

    /**
     * Applies any pending changes.
     * Will be called at the end of processing.
     * Avoid relying on this except in fast mode.
     */
    commit?(): Promise<void>;
}

export interface RemoteSoftware {
    name: string;
    version: string;
}

/**
 * Utility type to reduce verbose code in remote implementations.
 * Implementations can return any of these forms:
 * * A full `BlockResult` object - it will be used as-is.
 * * A `BlockResult` without the `block` property - it will be added automatically.
 * * A `BlockAction` - it will be wrapped into a `BlockResult` with zero lost relations.
 */
export type PartialBlockResult = SemiPartial<BlockResult, 'block'> | BlockAction;

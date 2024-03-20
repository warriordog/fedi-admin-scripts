import {Block} from "../domain/block.js";
import {Post} from "../domain/post.js";
import {BlockResult} from "../domain/blockResult.js";

export abstract class Remote {
    /**
     * Hostname of this remote.
     */
    abstract readonly host: string;

    /**
     * Statistics of the block actions taken so far.
     */
    readonly stats: RemoteStats = {
        createdBlocks: [],
        updatedBlocks: [],
        failedBlocks: []
    };

    /**
     * Attempts to apply the provided block to the instance, returning the result of the operation
     * @param block Block to apply
     */
    async tryApplyBlock(block: Block): Promise<BlockResult> {
        try {
            const result = await this.applyBlock(block);

            if (result === 'created') {
                this.stats.createdBlocks.push(block);

            } else if (result === 'updated') {
                this.stats.updatedBlocks.push(block);

            } else if (result === 'unsupported') {
                this.stats.failedBlocks.push(block);
            }

            return result;

        } catch (e) {
            this.stats.failedBlocks.push(block);

            throw e;
        }
    }

    protected abstract applyBlock(block: Block): Promise<BlockResult>;

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

export interface RemoteStats {
    /**
     * All new blocks that were created in this session.
     */
    createdBlocks: Block[];

    /**
     * All existing blocks that were updated in this session.
     */
    updatedBlocks: Block[];

    /**
     * All blocks that could not be processed due to an unsupported mode or flag.
     */
    failedBlocks: Block[];

    /**
     * Number of inward follow relations that have been blocked during this session.
     * An inward follow relation is a remote user who follows a local user.
     * Undefined if the remote does not track this information.
     */
    lostFollowers?: number;

    /**
     * Number of outward follow relations that have been blocked during this session.
     * An outward follow relation is a local user who follows a remote user.
     * Undefined if the remote does not track this information.
     */
    lostFollows?: number;
}

export interface RemoteSoftware {
    name: string;
    version: string;
}

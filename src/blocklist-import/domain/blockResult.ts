import {Block} from "./block.js";

export interface BlockResult {
    block: Block;
    action: BlockAction;
    lostFollows?: number | FollowRelation[];
    lostFollowers?: number | FollowRelation[];
    error?: Error;
}

export type BlockAction = 'created' | 'updated' | 'unchanged' | 'excluded';
export interface FollowRelation {
    follower: string;
    followee: string;
}

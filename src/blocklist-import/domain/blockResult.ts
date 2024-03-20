import {Block} from "./block.js";

export interface BlockResult {
    block: Block;
    action: BlockAction;
    lostFollows?: number | FollowRelation[];
    lostFollowers?: number | FollowRelation[];
}

export type BlockAction = 'created' | 'updated' | 'skipped' | 'unsupported';
export interface FollowRelation {
    follower: string;
    followee: string;
}

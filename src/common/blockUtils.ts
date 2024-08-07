import {Block} from "./domain/block.js";

export function compareBlocks(a: Block, b: Block): number {
    return a.host.localeCompare(b.host);
}
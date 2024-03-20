// We moved the type into the config itself, to reduce duplication
import {AnnouncementConfig} from "../../../config/importBlocklist.js";

export * from '../../../config/importBlocklist.js';

export const defaultAnnouncementConfig: AnnouncementConfig = {
    enabled: true,
    publishPosts: false,
    includeInstanceName: true,
    includeNumberOfBlocks: false,
    includeUpdatedBlocks: true,
    includeBlockReason: true,
    includeRedactedBlocks: false,
    groupByAction: false,
    sortBlocks: true
};

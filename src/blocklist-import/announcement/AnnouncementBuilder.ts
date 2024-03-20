import {AnnouncementConfig} from "../../../config/importBlocklist.js";
import {Remote} from "../remote/remote.js";
import {Announcement, AnnouncementBody, AnnouncementSection} from "./announcement.js";
import {Block} from "../domain/block.js";

export class AnnouncementBuilder {
    constructor(
        private readonly config: AnnouncementConfig
    ) {}

    createAnnouncement(remote: Remote): Announcement {
        const body: AnnouncementBody = [];

        // Get all included blocks (will be filtered down again).
        let allBlocks = remote.stats.createdBlocks;
        if (this.config.includeUpdatedBlocks) {
            allBlocks = allBlocks.concat(remote.stats.updatedBlocks);
        }

        // We either group by type, or put all blocks in one group.
        if (this.config.groupByAction) {
            this.addActionGroups(body, allBlocks)
        } else {
            this.addGroup(body, allBlocks, 'have been blocked');
        }

        const header = this.createHeaderSection(remote);
        return { header, body };
    }

    private createHeaderSection(remote: Remote): AnnouncementSection {
        const instanceName = this.config.includeInstanceName
            ? `\`${remote.host}\``
            : 'instance';

        return {
            text: `The ${instanceName} blocklist has been updated.`
        };
    }

    private addActionGroups(body: AnnouncementSection[], allBlocks: Block[]): void {
        this.addSuspendedGroup(body, allBlocks);
        this.addSilencedGroup(body, allBlocks);
        this.addUnlistedGroup(body, allBlocks);
        this.addDisconnectedGroup(body, allBlocks);
        this.addSetNSFWGroup(body, allBlocks);
        this.addRejectMediaGroup(body, allBlocks);
        this.addRejectAvatarsGroup(body, allBlocks);
        this.addRejectBackgroundsGroup(body, allBlocks);
        this.addRejectReportsGroup(body, allBlocks);
    }

    private addSuspendedGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been suspended (completely defederated)', b => b.suspend);
    }

    private addSilencedGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been silenced (hidden from all except followers)', b => b.silence);
    }

    private addUnlistedGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been unlisted (removed from global timeline)', b => b.unlist);
    }

    private addDisconnectedGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been disconnected (will no longer receive posts from this instance)', b => b.disconnect);
    }

    private addSetNSFWGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been flagged as NSFW (all media will be marked as sensitive)', b => b.setNSFW);
    }

    private addRejectMediaGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'now reject media (media attachments will be replaced with a link)', b => b.rejectMedia);
    }

    private addRejectAvatarsGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'now reject avatars (profile pictures will be removed)', b => b.rejectAvatars);
    }

    private addRejectBackgroundsGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'now reject backgrounds (profile backgrounds will be removed)', b => b.rejectBackgrounds);
    }

    private addRejectReportsGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'cannot forward reports (reports from these instances will be ignored)', b => b.rejectReports);
    }

    private addGroup(body: AnnouncementSection[], allBlocks: Block[], action: string, filter?: (b: Block) => boolean): void {
        const items = this.serializeBlocks(allBlocks, filter);
        if (items.length < 1)
            return;

        const caption = this.config.includeNumberOfBlocks
            ? `The following **${items.length}** instances ${action}:`
            : `The following instances ${action}:`;

        body.push({ caption, items });
    }

    private serializeBlocks(blocks: Block[], filter?: (b: Block) => boolean): string[] {
        // Filter out redacted blocks
        if (!this.config.includeRedactedBlocks) {
            blocks = blocks.filter(b => !b.redact);
        }

        // Filter out with custom filter
        if (filter) {
            blocks = blocks.filter(filter);
        }

        // Filter out with user filter
        if (this.config.blockFilter) {
            blocks = blocks.filter(b => this.config.blockFilter!(b));
        }

        // Sort blocks by host name
        if (this.config.sortBlocks) {
            blocks.sort((a, b) => a.host.localeCompare(b.host));
        }

        // Serialize into list elements
        return blocks.map(b => {
            if (this.config.includeBlockReason && b.reason)
                return `- \`${b.host}\` for ${b.reason}`;

            else
                return `- \`${b.host}\``;
        });
    }
}

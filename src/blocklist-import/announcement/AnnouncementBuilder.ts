import {AnnouncementConfig} from "../../../config/importBlocklist.js";
import {Remote} from "../../common/remote/Remote.js";
import {Announcement, AnnouncementBody, AnnouncementSection} from "./announcement.js";
import {Block} from "../../common/domain/block.js";

export class AnnouncementBuilder {
    constructor(
        private readonly config: AnnouncementConfig
    ) {}

    createAnnouncement(remote: Remote): Announcement {
        const body: AnnouncementBody = [];

        // Get all included blocks (will be filtered down again).
        let allBlocks = remote.getCreatedBlocks().map(b => b.block);
        if (this.config.includeUpdatedBlocks) {
            const updatedBlocks = remote.getUpdatedBlocks().map(b => b.block);
            allBlocks = allBlocks.concat(updatedBlocks);
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
        this.addGhostedGroup(body, allBlocks);
        this.addSetNSFWGroup(body, allBlocks);
        this.addRejectMediaGroup(body, allBlocks);
        this.addRejectAvatarsGroup(body, allBlocks);
        this.addRejectBackgroundsGroup(body, allBlocks);
        this.addRejectReportsGroup(body, allBlocks);
    }

    private addSuspendedGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been suspended (completely defederated)', b => b.severity === 'suspend');
    }

    private addSilencedGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been silenced (hidden from all except followers)', b => b.severity === 'silence');
    }

    private addUnlistedGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been unlisted (removed from global timeline)', b => b.severity === 'unlist');
    }

    private addGhostedGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been ghosted (will no longer receive posts from this instance)', b => b.severity === 'ghost');
    }

    private addSetNSFWGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'have been flagged as NSFW (all media will be marked as sensitive)', b => b.setNSFW === true);
    }

    private addRejectMediaGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'now reject media (media attachments will be replaced with a link)', b => b.rejectMedia === true);
    }

    private addRejectAvatarsGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'now reject avatars (profile pictures will be removed)', b => b.rejectAvatars === true);
    }

    private addRejectBackgroundsGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'now reject backgrounds (profile backgrounds will be removed)', b => b.rejectBackgrounds === true);
    }

    private addRejectReportsGroup(body: AnnouncementSection[], blocks: Block[]): void {
        this.addGroup(body, blocks, 'cannot forward reports (reports from these instances will be ignored)', b => b.rejectReports === true);
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
            if (this.config.includeBlockReason && b.publicReason)
                return `- \`${b.host}\` for "${b.publicReason}"`;

            else
                return `- \`${b.host}\``;
        });
    }
}

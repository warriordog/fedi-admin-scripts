import {
    Announcement,
    AnnouncementSection,
    isListSection,
    isTextSection,
    ListSection,
    TextSection
} from "./announcement.js";
import {Post} from "../domain/post.js";

/**
 * Converts a semantic Announcement into a raw Post.
 * If necessary, the text body will be automatically chunked into a thread to ensure that it fits within the maximum post length.
 * @param announcement
 * @param maxPostLength
 */
export function renderAnnouncement(announcement: Announcement, maxPostLength: number): Post {
    const body = Array.isArray(announcement.body)
        ? announcement.body
        : [ announcement.body ];

    // Default arrangement:
    // [P0] - rootPost
    //   [P1] - currentPost
    let currentPost: Post = { text: '', replies: [] };
    let rootPost: Post = { text: '', replies: [ currentPost ] };

    // Render the header into the root.
    // If it's missing or short, we'll return later to merge it in.
    if (announcement.header) {
        renderSection(announcement.header, rootPost, maxPostLength);
    }

    // Sections are rendered to the current post and will overflow - as a chunk - to a new sibling.
    // Content within the sections will overflow to a reply chain underneath the current post.
    for (const section of body) {
        const didOverflow = renderSection(section, currentPost, maxPostLength);

        // If we overflowed *anywhere* within the section, then we need to forcibly break.
        // Otherwise, the next section might be small enough to fit, which would end up looking like this:
        // [P0] Header
        //   [P1] Section 1 (start)
        //   [P1] Section 2
        //   [P1] Section 3 (start)
        //     [R1] Section 1 (partial)
        //       [R2] Section 1 (partial)
        //         [R3] Section 1 (terminal)
        //     [R4] Section 3 (partial)
        //       [R5] Section 3 (terminal)
        //   [P2] Section 4
        //
        // Just very confusing to read.
        // This alternate overflow will instead look like this:
        //
        // [P0] Header
        //   [P1] Section 1 (start)
        //     [R1] Section 1 (partial)
        //       [R2] Section 1 (partial)
        //         [R3] Section 1 (terminal)
        //   [P2] Section 2
        //   [P2] Section 3 (start)
        //     [R4] Section 3 (partial)
        //       [R5] Section 3 (terminal)
        //   [P3] Section 4
        //
        // The difference is in the reading order.
        // The former version reads like [H,1,2,3,1,1,1,3,3,4], while the latter reads in order: [H,1,1,1,1,2,3,3,3,3,4].
        // This is much easier to understand, is visually clearer, *and* works on Mastodon's flattened thread UI.
        if (didOverflow) {
            currentPost = { text: '', replies: [] };
            rootPost.replies.push(currentPost);
        }
    }

    // If the body fit into just one post, then see if we can merge it with the header.
    // That will be visually cleaner than having the header randomly separated.
    if (rootPost.replies.length === 1 && (rootPost.text.length + currentPost.text.length) <= maxPostLength) {
        currentPost.text = rootPost.text + currentPost.text;
        rootPost = currentPost;
    }

    // Trim leading and trailing whitespace from all posts.
    trimPost(rootPost);

    return rootPost;
}

// TODO find out why we sometimes end up with an extra, empty reply

function trimPost(post: Post): void {
    post.text = post.text.trim();

    for (const reply of post.replies) {
        trimPost(reply);
    }
}

function renderSection(section: AnnouncementSection, post: Post, maxLength: number): boolean {
    if (isTextSection(section))
        return renderTextSection(section, post, maxLength);

    else if (isListSection(section))
        return renderListSection(section, post, maxLength);

    else
        throw new Error('Invalid announcement section');
}

function renderTextSection(section: TextSection, post: Post, maxLength: number): boolean {
    // Force it into array form to simplify the code
    const segments = Array.isArray(section.text)
        ? section.text
        : [ section.text ];

    // Make sure to include section separator
    segments.push('\n\n');

    // This will add all text to the post, overflowing into replies if needed.
    return renderText(segments, post, maxLength);
}

function renderListSection(section: ListSection, post: Post, maxLength: number): boolean {
    // Merge into a single [caption?, items*, separator] array, with newline separators
    const segments = section.items
        .map(i => [i, '\n'])
        .flat();

    // Prepend the header / caption
    if (section.caption) {
        segments.unshift(section.caption, '\n');
    }

    // Make sure to include section separator.
    // There is only one here, because the segments array already includes one.
    segments.push('\n');

    // This will add all text to the post, overflowing into replies if needed.
    return renderText(segments, post, maxLength);
}

function renderText(segments: string[], post: Post, maxLength: number): boolean {
    let didBreak = false;

    for (let segment of segments) {
        // Try to break between segments if possible.
        // If the text won't fit in this post but *will* fit into a fresh one, then go ahead and break.
        if (segment.length <= maxLength && segment.length + post.text.length > maxLength) {
            post = replyTo(post, segment);
            didBreak = true;
            continue;
        }

        // If it doesn't fit, then break it into chunks.
        while (segment.length > 0) {
            // This will return the length of the text or the remaining space in the post - whichever is smaller.
            const remainingLength = maxLength - post.text.length;
            const end = Math.min(segment.length, remainingLength);

            // "Move" the chunk from segment to post.
            post.text += segment.substring(0, end);
            segment = segment.substring(end);

            // Break post when it's full
            if (segment.length > 0) {
                post = replyTo(post);
                didBreak = true;
            }
        }
    }

    return didBreak;
}

function replyTo(post: Post, text: string = ''): Post {
    const reply: Post = {
        text,
        replies: []
    };
    post.replies.push(reply);
    return reply;
}

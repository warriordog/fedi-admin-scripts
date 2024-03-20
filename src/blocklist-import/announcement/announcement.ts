export interface Announcement {
    header?: AnnouncementSection;
    body: AnnouncementBody;
}

export type AnnouncementBody = AnnouncementSection | AnnouncementSection[];
export type AnnouncementSection = TextSection | ListSection;
export interface TextSection {
    text: string | string[];
}
export interface ListSection {
    caption?: string;
    items: string[];
}

export function isTextSection(section: AnnouncementSection): section is TextSection {
    return 'text' in section;
}
export function isListSection(section: AnnouncementSection): section is ListSection {
    return 'items' in section;
}

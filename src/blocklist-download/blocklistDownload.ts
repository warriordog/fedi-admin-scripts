// Read parameters
import {createRemote} from "../common/remote/createRemote.js";
import {writeCSVFile} from "../common/util/csv.js";
import {parseConnectionString} from "../common/util/connectionString.js";
import {compareBlocks} from "../common/blockUtils.js";

if (process.argv.length != 4) {
    console.warn('Usage: npm run blocklist-download -- <save_path> <connection_string>');
    console.warn('Connection string format: software://token@host');
    console.warn('  - software: type of backend software for the instance.');
    console.warn('  - token: access token for an admin account.');
    console.warn('  - host: hostname of the instance.');
    console.warn('Supported software:');
    console.warn('  - sharkey');
    console.warn('  - pleroma');
    console.warn('  - akkoma');
    process.exit(1);
}

const savePath = process.argv[2];
const connection = parseConnectionString(process.argv[3]);

// Connect to instance
const remote = createRemote(connection);

// Download blocklist
const blocks = await remote.getBlocklist();
blocks.sort(compareBlocks);

// Write blocklist
const blocklist = [
    ['#domain', '#severity', '#reject_media', '#reject_reports', '#public_comment', '#obfuscate', '#private_comment', '#set_nsfw', '#reject_avatars', '#reject_banners', '#reject_backgrounds'],
    ...blocks.map(b => ([
        b.host,
        b.severity || 'none',
        b.rejectMedia ? 'TRUE' : 'FALSE',
        b.rejectReports ? 'TRUE' : 'FALSE',
        b.publicReason ?? '',
        b.redact ? 'TRUE' : 'FALSE',
        b.privateReason ?? '',
        b.setNSFW ? 'TRUE' : 'FALSE',
        b.rejectAvatars ? 'TRUE' : 'FALSE',
        b.rejectBanners ? 'TRUE' : 'FALSE',
        b.rejectBackgrounds ? 'TRUE' : 'FALSE'
    ]))
];
await writeCSVFile(savePath, blocklist);
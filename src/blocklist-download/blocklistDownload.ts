// Read parameters
import {createRemote, isRemoteType} from "../common/remote/createRemote.js";
import {writeCSVFile} from "../common/util/csv.js";

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
const [_, software, token, host] = process.argv[3].match(/^(\w+):\/\/([^@]+)@([\w-.]+)$/) ?? [null, null, null, null];
if (!software || !token || !host) {
    console.warn('Connection string is invalid: software, token, and host are required.');
    process.exit(1);
}
if (!isRemoteType(software)) {
    console.warn(`Unsupported software: ${software}`);
    process.exit(1);
}

// Connect to instance
const remote = createRemote({
    type: software,
    host,
    token
}, {
    fastMode: false,
    dryRun: true,
    preserveConnections: true
});

// Download blocklist
const blocks = await remote.getBlocklist();
blocks.sort((a, b) => a.host.localeCompare(b.host));

// Write blocklist
const blocklist = [
    ['#domain', '#severity', '#reject_media', '#reject_reports', '#public_comment', '#obfuscate', '#private_comment', '#set_nsfw', '#reject_avatars', '#reject_banners', '#reject_backgrounds'],
    ...blocks.map(b => ([
        b.host,
        b.limitFederation || 'none',
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
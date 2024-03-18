import {importBlocklist} from "./importer.js";
import {default as config} from '../../config/importBlocklist.js';

await importBlocklist(config);

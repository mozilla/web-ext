import { main } from './program.js';
import cmd from './cmd/index.js';

// This only exposes main and cmd, while util/logger and util/adb are defined as
// separate additional exports in the package.json.
export default { main, cmd };

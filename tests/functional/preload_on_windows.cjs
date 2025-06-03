// A commonly used trick to load Node.js scripts on Windows is via a .cmd or
// .bat script that launches it, but that does not work any more:
//
// - Due to CVE-2024-27980, Node.js rejects spawn() with EINVAL when a cmd or
//   bat files is passed, unless "shell: true" is set.
//   For example, see: https://github.com/mozilla/web-ext/issues/3435
//
// - When a batch script calls a program, file descriptors are not inherit by
//   that program. This is a problem for fake-chrome-binary.js, which expects
//   file descriptors 3 and 4.
//
// This file provides a work-around: The test script preloads this module with:
// NODE_OPTIONS='--require [this absolute path]'
//
// It monkey-patches child_process.spawn to make sure that it can spawn .js
// files as binaries, just like other platforms.

const child_process = require('node:child_process');

const orig_spawn = child_process.spawn;
child_process.spawn = function(command, args, options, ...remainingArgs) {
  if (typeof command === 'string') {
    if (command.endsWith('fake-chrome-binary.js')) {
      args = args ? [command, ...args] : [command];
      command = process.execPath;
    }
  }
  return orig_spawn.call(this, command, args, options, ...remainingArgs);
};

// Even though the file name is deceiving, this task comes from
// grunt-flow-type-check.
// The more useful stuff is in .flowconfig
module.exports = {
  check: {
    src: '.',
  },
  server: {
    src: '.',
    options: {
      background: true,
    },
  },
};

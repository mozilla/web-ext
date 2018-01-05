module.exports = {
  'dist-files-to-artifacts-dir': {
    files: [
      {
        expand: true,
        src: ['package.json', 'dist/**', 'bin/**'],
        dest: 'artifacts/production',
      },
    ],
  },
};

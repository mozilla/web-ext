// Inline `process.env.<NAME>` references with their literal build-time value.
//
// This is a minimal, Babel 8 compatible replacement for the unmaintained
// `babel-plugin-transform-inline-environment-variables` package, which relied
// on `path.toComputedKey()` (removed in Babel 8).
module.exports = function ({ types: t }) {
  function isLeftSideOfAssignmentExpression(path) {
    return (
      t.isAssignmentExpression(path.parent) && path.parent.left === path.node
    );
  }

  function getComputedKey(path) {
    const { node } = path;
    if (node.computed) {
      return node.property;
    }
    if (t.isIdentifier(node.property)) {
      return t.stringLiteral(node.property.name);
    }
    return node.property;
  }

  return {
    name: 'inline-environment-variables',
    visitor: {
      MemberExpression(path, { opts: { include, exclude } = {} }) {
        if (!path.get('object').matchesPattern('process.env')) {
          return;
        }

        const key = getComputedKey(path);

        if (
          t.isStringLiteral(key) &&
          !isLeftSideOfAssignmentExpression(path) &&
          (!include || include.indexOf(key.value) !== -1) &&
          (!exclude || exclude.indexOf(key.value) === -1)
        ) {
          path.replaceWith(t.valueToNode(process.env[key.value]));
        }
      },
    },
  };
};

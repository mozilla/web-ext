#!/bin/sh

set -e

CWD=`pwd`

onExit() {
  cd $CWD
}

trap onExit EXIT

if [ -z "$TRAVIS" ]; then
  echo "This smoke test will remove your 'node_modules/' dir and it is supposed to run only on Travis CI."
  exit 1
fi

echo "Removing the exitent node_modules/ dir content..."
rm -rf node_modules/

echo "Reinstall the node_modules/ dependencies in production mode..."
npm install --production

echo "Run: 'web-ext --version' ..."
$CWD/bin/web-ext --version

echo "Copy a minimal webextension into /tmp/minimal-web-ext ..."
cp -rf tests/fixtures/minimal-web-ext /tmp/minimal-web-ext

echo "Run: 'web-ext build' ..."
cd /tmp/minimal-web-ext
$CWD/bin/web-ext build

#!/bin/bash
rm -rf dist/firefox
mkdir -p dist/firefox
cp -r shared/* dist/firefox/
cp firefox/manifest.json dist/firefox/
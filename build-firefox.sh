#!/bin/bash
rm -rf dist/firefox
mkdir -p dist/firefox
cp -r src/* dist/firefox/
cp firefox/manifest.json dist/firefox/
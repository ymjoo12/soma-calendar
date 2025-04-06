#!/bin/bash
rm -rf dist/chrome
mkdir -p dist/chrome
cp -r shared/* dist/chrome/
cp chrome/manifest.json dist/chrome/
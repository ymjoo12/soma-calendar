#!/bin/bash
rm -rf dist/chrome
mkdir -p dist/chrome
cp -r src/* dist/chrome/
cp chrome/manifest.json dist/chrome/
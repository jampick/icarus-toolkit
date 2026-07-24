#!/usr/bin/env bash
# Full local/CI test pass: data pipeline + dist build, then app-logic smoke tests.
set -e
cd "$(dirname "$0")/.."

python3 scripts/test_pipeline.py
node scripts/test_app.mjs

echo
echo "PASS"

#!/usr/bin/env bash
# Commit everything in the data-branch worktree and push it, rebasing onto any commits that
# another workflow (lift logger, network snapshot) pushed in the meantime.
#   usage: commit-data.sh <worktree> <message>
set -euo pipefail
cd "$1"
git add -A
if git diff --cached --quiet; then
    echo "Nothing to commit"
    exit 0
fi
git commit -q -m "$2"
for attempt in 1 2 3 4 5; do
    if git push -q origin HEAD:data; then
        exit 0
    fi
    sleep $((attempt * 5))
    git pull -q --rebase origin data
done
echo "Could not push to data after 5 attempts" >&2
exit 1

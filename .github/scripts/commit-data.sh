#!/usr/bin/env bash
# Commit everything in the data-branch worktree and push it, rebasing onto any commits that
# another workflow (lift logger, network snapshot) pushed in the meantime. Also pushes commits
# left over from an earlier call whose push failed, so a network outage delays data rather
# than losing it.
#   usage: [PUSH_ATTEMPTS=n] commit-data.sh <worktree> <message>
set -euo pipefail
cd "$1"
git add -A
if git diff --cached --quiet; then
    echo "Nothing new to commit"
else
    git commit -q -m "$2"
fi
# Waits of 5, 10, 20, 40 and 80 s between the default 5 attempts: rides out a short outage at
# github.com.
attempts="${PUSH_ATTEMPTS:-5}"
for attempt in $(seq 1 "$attempts"); do
    if git push -q origin HEAD:data; then
        exit 0
    fi
    [ "$attempt" -lt "$attempts" ] || break
    sleep $((5 * 2 ** (attempt - 1)))
    # The pull can fail for the same reason as the push; the next attempt tries again. A
    # rebase that stops half way is undone, so the worktree stays usable.
    git pull -q --rebase origin data || git rebase --abort 2>/dev/null || true
done
echo "Could not push to data after $attempts attempts; the commits stay in the worktree" >&2
exit 1

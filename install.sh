#!/bin/sh
# Copies this checkout's status-quota mod into herdr-app, then checks it.
# Rerun after pulling updates. The copied folder stays real (see README):
# a symlink loads, but its icons fail to resolve and saves there do not
# hot-reload.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
herdr_home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
dest="$herdr_home/mods/status-quota"
mkdir -p "$dest"
# Copy the repo's tracked files over the installed copy. The generated
# gpui-kit.d.ts and jsconfig.json are not tracked here, so an installed
# copy's own versions stay untouched.
cp -R "$here/mods/status-quota/" "$dest/"
herdr-app check "$dest"
echo "installed $dest from $here/mods/status-quota"

#!/bin/sh
# The manifest is part of the SDK release; each artifact must match its SHA-256.
set -eu
if [ "${1:-}" = artifact ]; then
  hash="$2" path="$3"
  case "$hash" in *[!0-9a-f]*|'') echo 'Invalid artifact hash' >&2; exit 1;; esac
  [ "${#hash}" -eq 64 ] || exit 1
  case "$path" in /*|*'..'*|*[!A-Za-z0-9_./+-]*|'') echo 'Invalid artifact path' >&2; exit 1;; esac
  blob="/root/.m2/rtc-tax-artifacts/$hash"
  if ! { [ -f "$blob" ] && echo "$hash  $blob" | sha256sum -c - >/dev/null 2>&1; }; then
    temp="$blob.$$.tmp"
    trap 'rm -f "$temp"' EXIT
    curl -fsSL --retry 3 --connect-timeout 15 --max-time 180 "https://repo.maven.apache.org/maven2/$path" -o "$temp"
    echo "$hash  $temp" | sha256sum -c - >/dev/null
    mv "$temp" "$blob"
    trap - EXIT
  fi
  output="/tmp/rtc-tax-maven-repository/$path"
  mkdir -p "$(dirname "$output")"
  cp "$blob" "$output"
  echo "$hash  $output" | sha256sum -c - >/dev/null
  exit 0
fi
mkdir -p /root/.m2/rtc-tax-artifacts /tmp/rtc-tax-maven-repository
xargs -n 2 -P 8 sh /work/fetch-maven-artifacts.sh artifact < /work/maven-artifacts.sha256

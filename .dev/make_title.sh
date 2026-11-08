#!/bin/sh
# Generated art (ChatGPT) -> the files the game uses:
#   .dev/media/landscape.png (or title-wide.png)   -> assets/title-wide.webp
#   .dev/media/portrait.png  (or title-mobile.png) -> assets/title-mobile.webp
#   .dev/media/squareimg.png (or cover.png)        -> cover.webp (capsule cover,
#       1080 x 1080) and ../squareimg/semnest.png (for upload-covers)
#   sh .dev/make_title.sh
set -e
cd "$(dirname "$0")/.."
pick() { for f in "$@"; do [ -f ".dev/media/$f" ] && { echo ".dev/media/$f"; return; }; done; }
W=$(pick landscape.png title-wide.png); P=$(pick portrait.png title-mobile.png); C=$(pick squareimg.png cover.png)
if [ -n "$W" ]; then cwebp -quiet -q 84 "$W" -o assets/title-wide.webp; ls -l assets/title-wide.webp; fi
if [ -n "$P" ]; then cwebp -quiet -q 84 "$P" -o assets/title-mobile.webp; ls -l assets/title-mobile.webp; fi
if [ -n "$C" ]; then
  cwebp -quiet -q 86 -resize 1080 1080 "$C" -o cover.webp
  sips -s format png -z 1080 1080 "$C" --out ../squareimg/semnest.png >/dev/null
  ls -l cover.webp ../squareimg/semnest.png
fi

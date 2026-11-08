#!/bin/sh
# Opening image: the generated PNGs -> assets/title-wide.webp and
# assets/title-mobile.webp (the game shows them instead of the placeholder).
#   put the images in .dev/media/title-wide.png and .dev/media/title-mobile.png
# Square tile (optional): .dev/media/cover.png -> cover.webp (capsule cover,
# 1080 x 1080) and ../squareimg/semnest.png (for upload-covers).
#   sh .dev/make_title.sh
set -e
cd "$(dirname "$0")/.."
if [ -f .dev/media/title-wide.png ]; then
  cwebp -quiet -q 84 -resize 1920 0 .dev/media/title-wide.png -o assets/title-wide.webp
  cwebp -quiet -q 84 -resize 1080 0 .dev/media/title-mobile.png -o assets/title-mobile.webp
  ls -l assets/title-wide.webp assets/title-mobile.webp
fi
if [ -f .dev/media/cover.png ]; then
  cwebp -quiet -q 86 -resize 1080 1080 .dev/media/cover.png -o cover.webp
  sips -s format png -z 1080 1080 .dev/media/cover.png --out ../squareimg/semnest.png >/dev/null
  ls -l cover.webp ../squareimg/semnest.png
fi

#!/bin/sh
# Opening image: the generated PNGs -> assets/title-wide.webp and
# assets/title-mobile.webp (the game shows them instead of the placeholder).
#   put the images in .dev/media/title-wide.png and .dev/media/title-mobile.png
#   sh .dev/make_title.sh
set -e
cd "$(dirname "$0")/.."
cwebp -quiet -q 84 -resize 1920 0 .dev/media/title-wide.png -o assets/title-wide.webp
cwebp -quiet -q 84 -resize 1080 0 .dev/media/title-mobile.png -o assets/title-mobile.webp
ls -l assets/title-wide.webp assets/title-mobile.webp

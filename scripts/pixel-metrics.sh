#!/usr/bin/env bash
# Measure how pixel-art a screenshot is.
#
#   scripts/pixel-metrics.sh frame <shot.png> [game-px] [hud-bottom]
#   scripts/pixel-metrics.sh pan <a.png> <b.png> [game-px] [hud-bottom]
#
# frame: works out the game pixel size (unless given), crops the HUD off the
# bottom, then reports the colour count and how much of the frame is flat.
# pan: takes two shots one small step apart, finds the whole-pixel shift that
# best lines them up, and reports the leftover difference.
#
# Needs only ImageMagick's `magick`. HUD_BOTTOM in device pixels is cropped
# off the bottom of a full-page screenshot; game-canvas shots need 0.
set -euo pipefail

PALETTE=52 # src/palette.js
HUD_BOTTOM=${HUD_BOTTOM:-0}
MAX_SHIFT=12 # game pixels tried either way for a pan
INSET=4 # pixels ignored at the edge of the pan comparison (roll wraps)

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

size() {
	magick "$1" -format "%w %h" info:
}

# Largest whole upscale that reproduces the image exactly, else 1. Measured
# on a block-aligned crop, so a shot with a HUD on top still detects.
detect() {
	local file=$1 w h k cw ch
	read -r w h <<< "$(size "$file")"
	h=$((h - HUD_BOTTOM))
	for ((k = 8; k > 1; k--)); do
		cw=$((w / k * k))
		ch=$((h / k * k))
		[ "$cw" -gt 640 ] && cw=640
		[ "$ch" -gt 400 ] && ch=400
		cw=$((cw / k * k))
		ch=$((ch / k * k))
		magick "$file" -crop "${cw}x${ch}+0+0" +repage "$tmp/c.png"
		magick "$tmp/c.png" -filter point -resize "$((cw / k))x$((ch / k))!" \
			-filter point -resize "${cw}x${ch}!" "$tmp/a.png"
		ae=$(magick compare -metric AE "$tmp/c.png" "$tmp/a.png" null: 2>&1 | awk '{ print int($1) }' || true)
		# A few pixels may move between frames (traffic), so allow a sliver.
		if [ "$ae" -lt $((cw * ch / 200)) ]; then
			echo "$k"
			return
		fi
	done
	echo 1
}

# Point-downscale to one pixel per game pixel, HUD cropped off.
frame() {
	local file=$1 k=$2 w h w1 h1
	read -r w h <<< "$(size "$file")"
	h=$((h - HUD_BOTTOM))
	w1=$((w / k))
	h1=$((h / k))
	magick "$file" -gravity north -crop "$((w1 * k))x$((h1 * k))+0+0" +repage \
		-filter point -resize "${w1}x${h1}!" "$3"
}

# White where a pixel differs from any of its eight neighbours.
edge_mask() {
	local file=$1 out=$2 i=0 dx dy
	rm -f "$tmp"/d*.png
	for dy in -1 0 1; do
		for dx in -1 0 1; do
			[ "$dx$dy" = "00" ] && continue
			i=$((i + 1))
			magick "$file" \( +clone -roll "$(printf '%+d%+d' "$dx" "$dy")" \) \
				-compose difference -composite -colorspace gray -threshold 0 "$tmp/d$i.png"
		done
	done
	magick "$tmp"/d*.png -evaluate-sequence max "$out"
}

# Fraction of pixels whose 3x3 neighbourhood is one colour.
flat_share() {
	local file=$1 mean
	edge_mask "$file" "$tmp/mask.png"
	mean=$(magick "$tmp/mask.png" -format "%[fx:mean]" info:)
	awk -v m="$mean" 'BEGIN { printf "%.3f", 1 - m }'
}

cmd=${1:-}
case "$cmd" in
frame)
	shot=${2:?usage: pixel-metrics.sh frame <shot.png> [game-px] [hud-bottom]}
	HUD_BOTTOM=${4:-$HUD_BOTTOM}
	given=${3:-}
	if [ -n "$given" ]; then
		k=$given
		how=given
	else
		k=$(detect "$shot")
		how=detected
	fi
	frame "$shot" "$k" "$tmp/frame.png"
	read -r fw fh <<< "$(size "$tmp/frame.png")"
	colours=$(magick "$tmp/frame.png" -format "%k" info:)
	flat=$(flat_share "$tmp/frame.png")
	printf '%-28s game px %s (%s), 1:1 %sx%s\n' "$(basename "$shot")" "$k" "$how" "$fw" "$fh"
	printf '%-28s colours %s / %s %s\n' "" "$colours" "$PALETTE" "$([ "$colours" -le "$PALETTE" ] && echo ok || echo OVER)"
	printf '%-28s flat share %s (tiny.london 0.42-0.55)\n' "" "$flat"
	;;
pan)
	a=${2:?usage: pixel-metrics.sh pan <a.png> <b.png> [game-px] [hud-bottom]}
	b=${3:?usage: pixel-metrics.sh pan <a.png> <b.png> [game-px] [hud-bottom]}
	HUD_BOTTOM=${5:-$HUD_BOTTOM}
	k=${4:-$(detect "$a")}
	frame "$a" "$k" "$tmp/a.png"
	frame "$b" "$k" "$tmp/b.png"
	read -r w h <<< "$(size "$tmp/a.png")"
	# Compare only the structure: flat fills line up under almost any shift,
	# which would hide a smeared pan.
	edge_mask "$tmp/a.png" "$tmp/ma.png"
	edge_mask "$tmp/b.png" "$tmp/mb.png"
	magick "$tmp/a.png" "$tmp/ma.png" -compose multiply -composite "$tmp/am.png"
	magick "$tmp/b.png" "$tmp/mb.png" -compose multiply -composite "$tmp/bm.png"
	magick "$tmp/bm.png" -gravity center -crop "$((w - 2 * INSET))x$((h - 2 * INSET))+0+0" +repage "$tmp/bt.png"
	magick "$tmp/ma.png" -gravity center -crop "$((w - 2 * INSET))x$((h - 2 * INSET))+0+0" +repage "$tmp/mat.png"
	best_shift=""
	best=999999999
	second=999999999
	for dy in $(seq $((-MAX_SHIFT)) "$MAX_SHIFT"); do
		for dx in $(seq $((-MAX_SHIFT)) "$MAX_SHIFT"); do
			shift=$(printf '%+d%+d' "$dx" "$dy")
			magick "$tmp/am.png" -roll "$shift" -gravity center \
				-crop "$((w - 2 * INSET))x$((h - 2 * INSET))+0+0" +repage "$tmp/at.png"
			ae=$(magick compare -metric AE "$tmp/at.png" "$tmp/bt.png" null: 2>&1 | awk '{ print int($1) }' || true)
			if [ "$ae" -lt "$best" ]; then
				second=$best
				best=$ae
				best_shift="$dx,$dy"
			elif [ "$ae" -lt "$second" ]; then
				second=$ae
			fi
		done
	done
	readonly area=$(((w - 2 * INSET) * (h - 2 * INSET)))
	edges=$(magick "$tmp/mat.png" -format "%[fx:mean]" info:)
	awk -v a="$area" -v e="$edges" -v b="$best" -v b2="$second" -v s="$best_shift" -v k="$k" \
		'BEGIN { printf "pan: game px %s, best whole-pixel shift %s, residual on edges %.3f (next best %.3f)\n", k, s, b / (e * a), b2 / (e * a) }'
	;;
*)
	sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
	exit 1
	;;
esac

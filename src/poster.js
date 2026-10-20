// Poster type for shop names: heavy, upper case and squeezed narrow, cream
// with an ink outline and an ink drop behind it, like a hand-painted sign.

// The first heavy condensed face the machine has, else a heavy sans squeezed.
export const POSTER_FONT =
	'"Anton", "Bebas Neue", "Oswald", Impact, Haettenschweiler, "Arial Narrow", "Helvetica Neue", Arial, system-ui, sans-serif'
export const INK = '#1A1E1B'
export const CREAM = '#E7E7E5'
const SQUEEZE = 0.82 // how narrow every face is drawn
const OUTLINE = 0.14 // ink outline, as a share of the type size
const DROP = 0.07 // ink drop down and right, as a share of the type size

// Width of `text` at `size` px, squeezed.
export function posterWidth(g, text, size) {
	g.font = `900 ${size}px ${POSTER_FONT}`
	return g.measureText(text.toUpperCase()).width * SQUEEZE + size * (OUTLINE + DROP)
}

// `text` centred on (cx, cy), at most `maxWidth` wide: squeezed further if it
// has to be, and smaller only if squeezing isn't enough.
export function posterText(g, text, cx, cy, size, maxWidth, fill = CREAM) {
	const upper = text.toUpperCase()
	let w = posterWidth(g, upper, size)
	if (w > maxWidth * 1.45) {
		size *= (maxWidth * 1.45) / w
		w = posterWidth(g, upper, size)
	}
	const squeeze = SQUEEZE * Math.min(1, maxWidth / w)
	g.save()
	g.font = `900 ${size}px ${POSTER_FONT}`
	g.textAlign = 'center'
	g.textBaseline = 'middle'
	g.lineJoin = 'round'
	g.translate(cx, cy + size * 0.04)
	g.scale(squeeze, 1)
	g.lineWidth = size * OUTLINE * 2
	g.strokeStyle = INK
	g.fillStyle = INK
	g.strokeText(upper, (size * DROP) / squeeze, size * DROP)
	g.fillText(upper, (size * DROP) / squeeze, size * DROP)
	g.strokeText(upper, 0, 0)
	g.fillStyle = fill
	g.fillText(upper, 0, 0)
	g.restore()
}

// Out cold for a moment: WASTED or BUSTED stands across the screen, the
// picture fades to black just before the cut, something happens in the dark
// (you wake in hospital, the police take their fine), and it fades back in.

const FADE = 0.45 // seconds either side of the cut

export function createKnockout({ show, fade = () => {}, cut = () => {} }) {
	let left = 0 // seconds the word stays up
	let waking = 0
	return {
		active: () => left > 0 || waking > 0,
		shown: () => left > 0,
		start: () => (left = show),
		update(dt) {
			if (left > 0) {
				left -= dt
				if (left > 0) return fade(left < FADE ? 1 - left / FADE : 0)
				left = 0
				fade(1)
				cut()
				waking = FADE
				return
			}
			if (waking <= 0) return
			waking = Math.max(0, waking - dt)
			fade(waking / FADE)
		},
	}
}

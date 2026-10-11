// Zoom the player controls, plus GTA 1's zoom-out as you speed up.
import { PX } from './map-image.js'

export function createCamera() {
	let zoom = 6
	let userZoom = 6.5
	let cruise = 0

	return {
		zoomBy: (f) => (userZoom = Math.max(0.5, Math.min(24, userZoom * f))),

		// Screen pixels per tile, and the top-left corner, centred on `target`.
		update(target, canvas, dt) {
			// Follow a slow average of speed, so bumping into walls doesn't pump the zoom.
			cruise += (target.speed - cruise) * Math.min(1, dt * 1.5)
			const want = userZoom * Math.max(0.4, 1 - cruise * 0.09)
			zoom += (want - zoom) * Math.min(1, dt * 3)
			const scale = PX * zoom * devicePixelRatio
			return {
				scale,
				x: target.x * scale - canvas.width / 2,
				y: target.y * scale - canvas.height / 2,
			}
		},
	}
}

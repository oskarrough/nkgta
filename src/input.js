// Keyboard, wheel and touch. Held keys are polled; one-shot actions fire
// callbacks. Touch controls answer the same axis, turbo and drive questions,
// so the game loop only ever talks to one input source.
import { createTouch } from './touch.js'

import { sound } from './sound.js'

const norm = (key) => (key.length === 1 ? key.toLowerCase() : key)

export function createInput(actions) {
	const keys = new Set()
	const touch = createTouch(actions)
	addEventListener('keydown', (e) => {
		if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
		const key = norm(e.key)
		keys.add(key)
		sound.start()
		if (e.repeat) return
		if (key === 'l') actions.toggleMute()
		if (key === 'e' || key === 'Enter') actions.use()
		if (key === '+' || key === '=') actions.zoom(1.25)
		if (key === '-') actions.zoom(0.8)
		if (key === 'n') actions.toggleStreetNames()
		if (key === 't') actions.toggleTransit()
		if (key === 'k') actions.toggleWalls()
		if (key === 'p') actions.cycleLook()
		if (key === 'm') actions.pickArea()
	})
	addEventListener('keyup', (e) => keys.delete(norm(e.key)))
	addEventListener('wheel', (e) => actions.zoom(e.deltaY < 0 ? 1.1 : 0.9), { passive: true })

	const held = (...ks) => ks.some((k) => keys.has(k))
	const keyAxis = () => ({
		x: held('ArrowRight', 'd') - held('ArrowLeft', 'a'),
		y: held('ArrowDown', 's') - held('ArrowUp', 'w'),
	})
	const keyDown = () => keyAxis().x !== 0 || keyAxis().y !== 0

	return {
		// Direction the player is pushing, each axis -1…1. A key wins if one
		// is held; otherwise the thumbstick's analogue deflection.
		axis: () => (keyDown() ? keyAxis() : touch.axis()),
		// Testing: hold space for turbo; the touch boost button does the same.
		turbo: () => keys.has(' ') || touch.turbo(),
		// In a car: the keyboard's up/down/left/right, or the stick translated
		// into throttle, turn and handbrake.
		drive: (car) => {
			if (keyDown()) {
				const axis = keyAxis()
				return { throttle: -axis.y, turn: axis.x, handbrake: keys.has(' ') }
			}
			return touch.drive(car)
		},
		setUse: touch.setUse,
		setDriving: touch.setDriving,
	}
}

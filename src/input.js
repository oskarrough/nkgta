// Keyboard, wheel, touch and gamepad. Held keys are polled; one-shot actions
// fire callbacks. Touch and the pad answer the same axis and drive
// questions, so the game loop only ever talks to one input source, and the
// sources add up rather than taking over from each other.
import { createTouch } from './touch.js'
import { createGamepad } from './gamepad.js'

import { sound } from './sound.js'

const norm = (key) => (key.length === 1 ? key.toLowerCase() : key)
const clamp = (v) => Math.max(-1, Math.min(1, v))
// A thumb on the glass, a stick in hand and the keys all push the same way;
// together they sum, and a source that isn't pushing adds nothing.
const mix = (...axes) => ({ x: clamp(axes.reduce((x, a) => x + a.x, 0)), y: clamp(axes.reduce((y, a) => y + a.y, 0)) })

export function createInput(actions) {
	const keys = new Set()
	const touch = createTouch(actions)
	// While the menu is up the pad is mute, as the keys are; Start still gets
	// through, so the same button that opened it closes it.
	const gamepad = createGamepad(actions, () => actions.menuOpen())
	addEventListener('keydown', (e) => {
		if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
		const key = norm(e.key)
		keys.add(key)
		sound.start()
		if (e.repeat) return
		if (key === '1' || key === '2' || key === '3') actions.choose(Number(key) - 1)
		if (key === 'v') actions.toggleCamera()
		if (key === 'l') actions.toggleMute()
		if (key === 'e' || key === 'Enter') actions.use()
		if (key === '+' || key === '=') actions.zoom(1.25)
		if (key === '-') actions.zoom(0.8)
		if (key === 'n') actions.toggleStreetNames()
		if (key === 't') actions.toggleTransit()
		if (key === 'k') actions.toggleWalls()
		if (key === 'p') actions.cycleLook()
		if (key === 'm') actions.pickArea()
		if (key === 'j') actions.toggleMusicDebug()
		if (key === 'r') actions.nextStation()
		if (e.code === 'Backquote' || key === '`') actions.toggleDebug()
	})
	addEventListener('blur', () => keys.clear())
	// Dragging keeps the cursor available for the rest of the game UI.
	let looking = false
	const canvas = document.getElementById('overlay')
	canvas.addEventListener('contextmenu', (e) => {
		if (actions.cameraActive()) e.preventDefault()
	})
	canvas.addEventListener('pointerdown', (e) => {
		if (e.pointerType !== 'mouse' || e.button !== 2 || !actions.cameraActive()) return
		looking = true
		actions.setLooking(true)
		canvas.setPointerCapture(e.pointerId)
		e.preventDefault()
	})
	canvas.addEventListener('pointermove', (e) => {
		if (looking) actions.look(e.movementX, e.movementY)
	})
	const stopLooking = () => {
		if (!looking) return
		looking = false
		actions.setLooking(false)
	}
	canvas.addEventListener('pointerup', stopLooking)
	canvas.addEventListener('lostpointercapture', stopLooking)
	canvas.addEventListener('pointercancel', stopLooking)
	addEventListener('blur', stopLooking)
	addEventListener('keyup', (e) => keys.delete(norm(e.key)))
	addEventListener('wheel', (e) => actions.zoom(e.deltaY < 0 ? 1.1 : 0.9), { passive: true })

	const held = (...ks) => ks.some((k) => keys.has(k))
	const keyAxis = () => ({
		x: held('ArrowRight', 'd') - held('ArrowLeft', 'a'),
		y: held('ArrowDown', 's') - held('ArrowUp', 'w'),
	})
	const keyDown = () => keyAxis().x !== 0 || keyAxis().y !== 0

	return {
		// Let go of every held key, e.g. when the menu opens.
		release: () => keys.clear(),
		// Direction the player is pushing, each axis -1…1. Keys push all or
		// nothing; the sticks add their analogue deflection on top.
		axis: () => {
			const pushed = keyDown() ? keyAxis() : { x: 0, y: 0 }
			return actions.move(mix(pushed, touch.axis(), gamepad.axis()))
		},
		// Overhead keyboard movement follows the player; the sticks stay
		// directional, pointing where you want to go.
		steer: () => (!actions.cameraActive() && keyDown() ? keyAxis() : null),
		// In a car: the keyboard's up/down/left/right, or a stick translated
		// into throttle, turn and handbrake. Triggers and a thumb can be held
		// at once, so the strongest push of each wins.
		drive: (car) => {
			if (keyDown()) {
				const axis = keyAxis()
				return { throttle: -axis.y, turn: axis.x, handbrake: keys.has(' ') }
			}
			const pad = gamepad.drive(car)
			const thumb = touch.drive(car)
			return {
				throttle: clamp(pad.throttle + thumb.throttle),
				turn: clamp(pad.turn + thumb.turn),
				handbrake: pad.handbrake || thumb.handbrake,
			}
		},
		setUse: touch.setUse,
		setDriving: touch.setDriving,
	}
}

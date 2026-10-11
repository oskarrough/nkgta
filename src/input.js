// Keyboard and wheel. Held keys are polled; one-shot actions fire callbacks.

const norm = (key) => (key.length === 1 ? key.toLowerCase() : key)

export function createInput(actions) {
	const keys = new Set()
	addEventListener('keydown', (e) => {
		if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
		const key = norm(e.key)
		keys.add(key)
		if (e.repeat) return
		if (key === 'e' || key === 'Enter') actions.use()
		if (key === '+' || key === '=') actions.zoom(1.25)
		if (key === '-') actions.zoom(0.8)
		if (key === 'n') actions.toggleStreetNames()
		if (key === 't') actions.toggleTransit()
		if (key === 'm') actions.pickArea()
	})
	addEventListener('keyup', (e) => keys.delete(norm(e.key)))
	addEventListener('wheel', (e) => actions.zoom(e.deltaY < 0 ? 1.1 : 0.9), { passive: true })

	const held = (...ks) => ks.some((k) => keys.has(k))
	return {
		// Direction the player is pushing, each axis -1, 0 or 1.
		axis: () => ({
			x: held('ArrowRight', 'd') - held('ArrowLeft', 'a'),
			y: held('ArrowDown', 's') - held('ArrowUp', 'w'),
		}),
		// Testing: hold space for turbo.
		turbo: () => keys.has(' '),
	}
}

// The debug menu's sliders for the camera's zoom knobs, live, and a button
// that copies them to paste back into ZOOM in camera.js.
const RANGES = {
	foot: [4, 30, 0.5],
	bike: [4, 30, 0.5],
	car: [4, 30, 0.5],
	out: [0, 0.9, 0.05],
	calm: [0, 10, 0.5],
	fast: [2, 40, 1],
	easeOut: [0.05, 4, 0.05],
	easeIn: [0.05, 6, 0.05],
	boom: [0.5, 6, 0.1],
	boomOut: [0, 8, 0.1],
	boomPerLength: [0, 1.5, 0.05],
}

export function tuneZoom(form, zoom, camera, player) {
	form.style.cssText =
		'display:grid;grid-template-columns:auto 9em 3em;gap:2px 6px;align-items:center;margin-top:0.6rem;color:#fff;font:11px monospace'
	// Keep the game's keys, pointers and wheel off the sliders; ` still closes.
	for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'wheel']) {
		form.addEventListener(type, (e) => e.code === 'Backquote' || e.stopPropagation())
	}
	for (const [key, [min, max, step]] of Object.entries(RANGES)) {
		const value = Object.assign(document.createElement('output'), { value: zoom[key] })
		const slider = Object.assign(document.createElement('input'), { type: 'range', min, max, step, value: zoom[key] })
		slider.addEventListener('input', () => (value.value = zoom[key] = Number(slider.value)))
		form.append(Object.assign(document.createElement('label'), { textContent: key }), slider, value)
	}
	const readout = form.appendChild(document.createElement('span'))
	readout.style.gridColumn = '1 / 3'
	const copy = Object.assign(document.createElement('button'), { type: 'button', textContent: 'copy' })
	copy.addEventListener('click', () => {
		const text = Object.entries(zoom).map(([k, v]) => `\t${k}: ${v},`)
		navigator.clipboard?.writeText(`export const ZOOM = {\n${text.join('\n')}\n}`)
		copy.textContent = 'copied'
		setTimeout(() => (copy.textContent = 'copy'), 1000)
	})
	form.append(copy)
	setInterval(() => {
		if (form.closest('[hidden]')) return
		const { away, boom } = camera.state()
		readout.textContent = `speed ${Math.abs(player.speed).toFixed(1)} out ${away.toFixed(2)} boom +${boom.toFixed(1)}`
	}, 100)
}

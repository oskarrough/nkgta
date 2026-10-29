// Quick feedback from the menu: one text box, sent to the game's inkast list.
// The write URL is public by design; anyone can add to the list, nobody can read it.
const INKAST = 'https://inkast.0sk.ar/n3fnd6j6'
const MAX_TEXT = 2000

// "Chrome 126 · Linux", enough to tell which browser a bug came from.
export function shortAgent(ua, touch = false) {
	const browser = /(Firefox|Edg|OPR|Chrome|Version)\/(\d+)/.exec(ua)
	const name = !browser ? 'browser' : ({ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[browser[1]] ?? browser[1])
	const os = /Android|iPhone|iPad|Windows|Mac OS X|Linux/.exec(ua)?.[0] ?? 'unknown'
	return `${name}${browser ? ` ${browser[2]}` : ''} · ${os}${touch ? ' · touch' : ''}`
}

const clock = (hour) => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`

// The player's words, a blank line, then where and how they were playing.
export function feedbackText(text, c) {
	const lines = [
		`url: ${c.url}`,
		`area: ${c.area}`,
		`position: x ${c.x.toFixed(1)}, y ${c.y.toFixed(1)}`,
		`street: ${c.street || '-'}`,
		`hour: ${clock(c.hour)}`,
		`vehicle: ${c.vehicle}`,
		`camera: ${c.camera}`,
		`browser: ${c.agent}`,
		`version: ${c.version}`,
	]
	return `${text.trim().slice(0, MAX_TEXT)}\n\n${lines.join('\n')}`
}

// `context()` says where the player is right now; `thank` toasts after a send.
export function createFeedback({ context, thank }) {
	const box = document.getElementById('feedback')
	const field = box.querySelector('textarea')
	// Typing here is not playing: keys and taps stop at the box.
	for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'wheel']) {
		box.addEventListener(type, (e) => e.stopPropagation())
	}
	const close = () => box.open && box.close()
	box.querySelector('[data-cancel]').addEventListener('click', close)
	box.addEventListener('submit', (e) => {
		e.preventDefault()
		const text = field.value.trim()
		if (!text) return
		const body = feedbackText(text, context())
		field.value = ''
		close()
		// Offline or blocked: the note is lost, quietly.
		fetch(INKAST, { method: 'POST', body })
			.then((res) => res.ok && thank())
			.catch(() => {})
	})
	// Ctrl or Cmd+Enter sends from the keyboard; plain Enter is a new line.
	field.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) box.requestSubmit()
	})
	return {
		isOpen: () => box.open,
		open() {
			if (box.open) return
			box.showModal()
			field.focus()
		},
	}
}

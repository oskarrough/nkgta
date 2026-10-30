// Quick feedback from the menu: one text box, sent to the game's inkast list.
// The write URL is public by design; anyone can add to the list, nobody can read it.
const INKAST = 'https://inkast.0sk.ar/n3fnd6j6'
const MAX_TEXT = 2000

export function shortAgent(ua, touch = false) {
	const browser = /(Firefox|Edg|OPR|Chrome|Version)\/(\d+)/.exec(ua)
	const name = !browser ? 'browser' : ({ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[browser[1]] ?? browser[1])
	const os = /Android|iPhone|iPad|Windows|Mac OS X|Linux/.exec(ua)?.[0] ?? 'unknown'
	return `${name}${browser ? ` ${browser[2]}` : ''} · ${os}${touch ? ' · touch' : ''}`
}

const clock = (hour) => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`

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

// The post app on the pocket device: type, Senden. Ctrl+Enter sends too.
export function createFeedback({ context, thank, pocket }) {
	const page = document.createElement('form')
	page.className = 'app-post'
	page.innerHTML = `
		<textarea maxlength="${MAX_TEXT}" placeholder="Was fällt dir auf? Was fehlt, was nervt?" aria-label="Feedback"></textarea>
		<div><small></small><button type="submit">Senden</button></div>`
	const field = page.querySelector('textarea')
	const note = page.querySelector('small')
	pocket.add({ id: 'post', key: { icon: 'menu-feedback', label: 'Post', title: 'Feedback (B)' }, page, live: true })
	// Typing here is not playing: keys stop at the box.
	for (const type of ['keydown', 'keyup']) page.addEventListener(type, (e) => e.stopPropagation())
	page.addEventListener('submit', (e) => {
		e.preventDefault()
		const text = field.value.trim()
		if (!text) return field.focus()
		const body = feedbackText(text, context())
		field.value = ''
		field.blur()
		note.textContent = 'gesendet…'
		fetch(INKAST, { method: 'POST', body })
			.then((res) => {
				note.textContent = res.ok ? 'Danke!' : 'ging nicht'
				if (res.ok) thank()
			})
			.catch(() => (note.textContent = 'ging nicht'))
	})
	field.addEventListener('input', () => (note.textContent = ''))
	field.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) page.requestSubmit()
		if (e.key === 'Escape') field.blur()
	})
	return {
		isOpen: () => document.activeElement === field,
		open() {
			pocket.show('post')
			field.focus()
		},
	}
}

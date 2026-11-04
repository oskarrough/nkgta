// While the menu is open, game keys stay with it instead of moving the player.
const GAME_KEYS = new Set([
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'w',
	'a',
	's',
	'd',
	' ',
	'e',
	'Enter',
	'g',
	'f',
	'q',
	'c',
	'x',
	'z',
	'Backspace',
])

// The Esc menu and the ` debug panel: grids of buttons whose `data-action` names an entry.
// An entry's `on()` returns true/false to light it, or nothing for a plain button.
export function createMenu({ input, keysElsewhere = () => false }) {
	const panel = document.getElementById('menu')
	const button = document.getElementById('menu-button')
	const debug = document.getElementById('debug')
	const entries = {}

	function refresh() {
		for (const el of document.querySelectorAll('.panel button[data-action]')) {
			const entry = entries[el.dataset.action]
			const on = entry?.on?.() ?? null
			el.classList.toggle('on', on === true)
			el.classList.toggle('off', on === false)
			el.ariaPressed = on === null ? null : String(on)
			entry?.paint?.(el)
		}
	}
	function show(open) {
		panel.hidden = !open
		button.ariaExpanded = String(open)
		input.release()
		if (open) refresh()
		else document.activeElement?.blur()
	}
	function showDebug(open) {
		debug.hidden = !open
		if (open) refresh()
	}

	for (const el of [panel, debug]) {
		el.addEventListener('click', (e) => {
			const target = e.target.closest('button[data-action]')
			if (!target) return
			entries[target.dataset.action]?.run()
			refresh()
			target.blur()
		})
	}
	button.addEventListener('click', () => {
		show(panel.hidden)
		button.blur()
	})
	addEventListener(
		'keydown',
		(e) => {
			if (keysElsewhere() || e.target.matches?.('input, textarea')) return
			if (e.key === 'Escape') show(panel.hidden)
			else if (!panel.hidden && GAME_KEYS.has(e.key.length === 1 ? e.key.toLowerCase() : e.key)) e.stopPropagation()
			else if (!panel.hidden || !debug.hidden) setTimeout(refresh)
		},
		{ capture: true },
	)
	addEventListener('pointerdown', (e) => {
		if (!panel.hidden && !e.target.closest('#menu, #menu-button')) show(false)
	})

	return {
		add(name, entry) {
			entries[name] = entry
		},
		open: () => show(true),
		close: () => show(false),
		toggle: () => show(panel.hidden),
		isOpen: () => !panel.hidden,
		showDebug,
		toggleDebug: () => showDebug(debug.hidden),
	}
}

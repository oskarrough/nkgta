// Every race saved in this area, as a panel from the menu: where it runs,
// from the first gate's street to the last's, how many gates, the best time
// with its vehicle, and how far away the start is. Los takes you to its start
// line for 3-2-1; the cross deletes it after a second tap. Neues Rennen drops
// gate A where you stand, and the keys underneath are the whole how-to.
// While it's open the game doesn't hear the keys; Esc or a tap outside closes it.
import { MODELS } from './models.js'
import { isDaily } from './daily.js'
import { clock } from './race.js'

const vehicleIcon = (v) => (v === 'foot' ? 'foot' : v === 'bike' ? 'act-bike' : 'act-car')
const vehicleName = (v) => (v === 'foot' ? 'zu Fuß' : v === 'bike' ? 'Fahrrad' : (MODELS[v]?.name ?? 'Auto'))

export function createRaceList({ world, player, races, start, remove, create, share, name }) {
	const el = document.createElement('div')
	el.id = 'races'
	el.className = 'panel'
	el.hidden = true
	document.body.append(el)
	let armed = null // the race whose cross was tapped once

	const where = (g) => world.streetAt(g.x, g.y) || '?'
	function route(r, i) {
		const from = where(r.gates[0])
		const to = where(r.gates.at(-1))
		const line = from === to ? from : from === '?' && to === '?' ? `Rennen ${i + 1}` : `${from} → ${to}`
		return isDaily(r) ? `Heute: ${line}` : line
	}
	const away = (g) => {
		const m = Math.hypot(g.x - player.x, g.y - player.y) * (world.tileM ?? 3)
		return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
	}

	function render() {
		const list = races()
		const rows = list
			.map((r, i) => {
				const best = r.best
					? `<img class="icon" src="/icons/${vehicleIcon(r.best.vehicle)}.png" alt="${vehicleName(r.best.vehicle)}" title="${vehicleName(r.best.vehicle)}"><b>${clock(r.best.time)}</b>`
					: '<b class="none">–</b>'
				return `<li>
					<span class="route"><strong>${route(r, i)}</strong><small>${r.gates.length} Tore · ${away(r.gates[0])}${r.rival ? ` · ${r.rival.name || 'Geist'} ${clock(r.rival.time)}` : ''}</small></span>
					<span class="best">${best}</span>
					<button type="button" class="go" data-i="${i}" title="Zum Start">Los</button>
					<button type="button" class="share" data-i="${i}" title="Link teilen, mit deinem Geist" aria-label="Link teilen">Teilen</button>
					<button type="button" class="del ${armed === r ? 'armed' : ''}" data-i="${i}" title="Löschen" aria-label="Löschen">${armed === r ? 'Weg?' : '✕'}</button>
				</li>`
			})
			.join('')
		el.innerHTML = `
			<h2><img class="icon" src="/icons/race-finish.png" alt="">Rennen</h2>
			${rows ? `<ol>${rows}</ol>` : '<p class="empty">Noch keine Rennen hier.</p>'}
			<button type="button" class="new"><img class="icon" src="/icons/race-gate.png" alt=""><span>Neues Rennen</span><kbd>G</kbd></button>
			<label class="name">Dein Name auf geteilten Geistern <input maxlength="24" value="${name.get()}" spellcheck="false" autocomplete="off"></label>
			<p class="how"><span><kbd>G</kbd> Tor setzen, wo du stehst</span><span><kbd>F</kbd> letztes Tor ist das Ziel, los</span><span><kbd>Q</kbd> nochmal von vorn</span></p>`
	}

	function open() {
		armed = null
		render()
		el.hidden = false
	}
	const close = () => (el.hidden = true)

	el.addEventListener('click', (e) => {
		const button = e.target.closest('button')
		if (!button) return
		const r = races()[Number(button.dataset.i)]
		if (button.classList.contains('new')) {
			close()
			create()
		} else if (button.classList.contains('share') && r) {
			share(r)
		} else if (button.classList.contains('go') && r) {
			close()
			start(r)
		} else if (button.classList.contains('del') && r) {
			if (armed === r) {
				remove(r)
				armed = null
			} else armed = r
			render()
		}
	})
	// Typing a name is not playing: keys stop at the box.
	el.addEventListener('change', (e) => {
		if (e.target.matches('.name input')) {
			name.set(e.target.value)
			e.target.value = name.get()
		}
	})
	for (const type of ['keydown', 'keyup']) el.addEventListener(type, (e) => e.target.matches('input') && e.stopPropagation())
	addEventListener('pointerdown', (e) => {
		if (!el.hidden && !e.target.closest('#races, #menu')) close()
	})
	// Registered before the game's own key handling, so it can keep keys from it.
	addEventListener(
		'keydown',
		(e) => {
			if (el.hidden) return
			if (e.target.matches?.('input')) return
			e.stopImmediatePropagation()
			if (e.key === 'Escape') close()
			else if (e.key.toLowerCase() === 'g') {
				close()
				create()
			}
		},
		{ capture: true },
	)

	return { open, close, isOpen: () => !el.hidden }
}

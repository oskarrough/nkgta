import './race-list.css'
import { MODELS } from './models.js'
import { isDaily } from './daily.js'
import { clock } from './race.js'

const vehicleIcon = (v) => (v === 'foot' ? 'foot' : v === 'bike' ? 'act-bike' : 'act-car')
const vehicleName = (v) => (v === 'foot' ? 'zu Fuß' : v === 'bike' ? 'Fahrrad' : (MODELS[v]?.name ?? 'Auto'))

// The race app on the pocket device: every race here, tap one for Teilen and
// the cross, Los takes you to its start.
export function createRaceList({ world, player, races, start, remove, create, share, name, pocket }) {
	const page = document.createElement('div')
	page.className = 'app-races scroll'
	let picked = null // the race whose row is open
	let armed = null // the race whose cross was tapped once
	pocket.add({ id: 'race', icon: 'race-finish', label: 'Rennen', page, live: true, shown: render })

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
		const rows = races()
			.map((r, i) => {
				const best = r.best
					? `<img src="/icons/${vehicleIcon(r.best.vehicle)}.png" alt="${vehicleName(r.best.vehicle)}" title="${vehicleName(r.best.vehicle)}">${clock(r.best.time)}`
					: '–'
				const more =
					picked === r
						? `<span class="more"><button type="button" class="share" data-i="${i}" title="Link teilen, mit deinem Geist">Teilen</button><button type="button" class="del ${armed === r ? 'armed' : ''}" data-i="${i}" title="Löschen" aria-label="Löschen">${armed === r ? 'Weg?' : '✕'}</button></span>`
						: ''
				return `<li class="${picked === r ? 'picked' : ''}">
					<span class="route" data-i="${i}"><strong>${route(r, i)}</strong><small>${away(r.gates[0])} · ${best}${r.rival ? ` · ${r.rival.name || 'Geist'} ${clock(r.rival.time)}` : ''}</small></span>
					<button type="button" class="go" data-i="${i}" title="Zum Start">Los</button>${more}
				</li>`
			})
			.join('')
		page.innerHTML = `
			${rows ? `<ol>${rows}</ol>` : '<p class="empty">Noch keine Rennen hier.</p>'}
			<button type="button" class="new"><img src="/icons/race-gate.png" alt=""><span>Neues Rennen</span><kbd>G</kbd></button>
			<p class="how"><kbd>G</kbd> Tor <kbd>F</kbd> Ziel, los <kbd>Q</kbd> nochmal</p>
			<label class="name">Dein Name für Geister <input maxlength="24" value="${name.get()}" spellcheck="false" autocomplete="off"></label>`
	}

	page.addEventListener('click', (e) => {
		const target = e.target.closest('button, .route')
		if (!target) return
		const r = races()[Number(target.dataset.i)]
		if (target.classList.contains('new')) create()
		else if (target.classList.contains('route') && r) {
			picked = picked === r ? null : r
			armed = null
			render()
		} else if (target.classList.contains('share') && r) share(r)
		else if (target.classList.contains('go') && r) start(r)
		else if (target.classList.contains('del') && r) {
			if (armed === r) {
				remove(r)
				armed = picked = null
			} else armed = r
			render()
		}
		target.blur?.()
	})
	page.addEventListener('change', (e) => {
		if (e.target.matches('.name input')) {
			name.set(e.target.value)
			e.target.value = name.get()
		}
	})
	// Typing a name is not playing: keys stop at the box.
	for (const type of ['keydown', 'keyup'])
		page.addEventListener(type, (e) => {
			if (!e.target.matches('input')) return
			e.stopPropagation()
			if (e.key === 'Escape' || e.key === 'Enter') e.target.blur()
		})

	return { render }
}

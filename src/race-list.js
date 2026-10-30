import './race-list.css'
import { MODELS } from './models.js'
import { isDaily } from './daily.js'
import { clock } from './race.js'
import { nickname } from './race-share.js'

const vehicleIcon = (v) => (v === 'foot' ? 'foot' : v === 'bike' ? 'act-bike' : 'act-car')
const vehicleName = (v) => (v === 'foot' ? 'zu Fuß' : v === 'bike' ? 'Fahrrad' : (MODELS[v]?.name ?? 'Auto'))

// Pixel symbols on a 7×7 grid, drawn in the screen's ink.
const PIXELS = {
	play: ['X......', 'XXX....', 'XXXXX..', 'XXXXXXX', 'XXXXX..', 'XXX....', 'X......'],
	bin: ['..XXX..', 'XXXXXXX', '.X...X.', '.X.X.X.', '.X.X.X.', '.X.X.X.', '.XXXXX.'],
	share: ['...X...', '..XXX..', '.X.X.X.', '...X...', 'X.....X', 'X.....X', 'XXXXXXX'],
}
const pixels = (name) =>
	`<svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true">${PIXELS[name]
		.flatMap((row, y) => [...row].map((c, x) => (c === 'X' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : '')))
		.join('')}</svg>`

// The race app on the pocket device: every race here, ▶ takes you to its
// start, tap one for sharing it (under your ghost name) and the bin.
export function createRaceList({ world, player, races, start, remove, create, share, name, pocket }) {
	const page = document.createElement('div')
	page.className = 'app-races scroll'
	let picked = null // the race whose row is open
	let armed = null // the race whose cross was tapped once
	pocket.add({
		id: 'race',
		key: { icon: 'race-finish', label: 'Rennen' },
		page,
		live: true,
		shown: render,
	})

	const where = (g) => world.streetAt(g.x, g.y) || '?'
	function route(r, i) {
		const from = where(r.gates[0])
		const to = where(r.gates.at(-1))
		const line = from === '?' && to === '?' ? `Rennen ${i + 1}` : from === to ? from : `${from} → ${to}`
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
						? `<span class="more"><button type="button" class="share" data-i="${i}" title="Link teilen, mit deinem Geist" aria-label="Teilen">${pixels('share')}</button><button type="button" class="alias" title="Der Name auf deinem Geist, antippen für einen neuen">als ${name.get()}</button></span>`
						: ''
				const del =
					picked === r
						? `<button type="button" class="del ${armed === r ? 'armed' : ''}" data-i="${i}" title="Löschen" aria-label="${armed === r ? 'Wirklich löschen' : 'Löschen'}">${pixels('bin')}</button>`
						: ''
				return `<li class="${picked === r ? 'picked' : ''}">
					<span class="route" data-i="${i}"><strong>${route(r, i)}</strong><small>${away(r.gates[0])} · ${best}${r.rival ? ` · ${r.rival.name || 'Geist'} ${clock(r.rival.time)}` : ''}</small></span>
					${del}<button type="button" class="go" data-i="${i}" title="Zum Start" aria-label="Zum Start">${pixels('play')}</button>${more}
				</li>`
			})
			.join('')
		page.innerHTML = `
			${rows ? `<ol>${rows}</ol>` : '<p class="empty">Noch keine Rennen hier.</p>'}
			<button type="button" class="new"><img src="/icons/race-gate.png" alt=""><span>Neues Rennen</span><kbd>G</kbd></button>`
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
		else if (target.classList.contains('alias')) {
			name.set(nickname())
			render()
		} else if (target.classList.contains('go') && r) start(r)
		else if (target.classList.contains('del') && r) {
			if (armed === r) {
				remove(r)
				armed = picked = null
			} else armed = r
			render()
		}
		target.blur?.()
	})
	return { render }
}

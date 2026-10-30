import { badgeColor, nearestPlace, placeName } from './places.js'
import { bottleIcon } from './sprites.js'
import { nearBike } from './player.js'
import { euro } from './pfand.js'
import { T } from './tiles.js'
import { createMinimap } from './minimap.js'
import './minimap.css'

export function useHint(player, car) {
	if (player.car) return 'aussteigen'
	if (player.onBike) return 'absteigen'
	if (nearBike(player)) return 'aufs Fahrrad'
	if (car) return car.ai ? 'Auto klauen' : 'einsteigen'
	return null
}

const ACTIONS = { aussteigen: 'exit', absteigen: 'exit', 'aufs Fahrrad': 'bike', 'Auto klauen': 'car', einsteigen: 'car' }
export function useAction(door, hint) {
	if (door) return door.startsWith('E: raus') ? 'exit' : door.startsWith('E: ') ? 'shop' : null
	return ACTIONS[hint] ?? null
}

const stopName = (s) => {
	const name = s.kind === 'ubahn' ? `U ${s.name || 'Bahnhof'}` : s.name || 'Haltestelle'
	return s.lines.length ? `${name} · ${s.lines.join(', ')}` : name
}

const STOP_DOT = { ubahn: '#115d91', bus: '#f5d000' }
const PRIVATE_DOT = '#9d9484'

export function createHud(world) {
	const minimap = createMinimap(world)
	// Only touch the DOM when text changes; writing it every frame costs a layout.
	const shown = {}
	function set(id, text) {
		if (shown[id] === text) return
		shown[id] = text
		document.getElementById(id).textContent = text
	}

	function dot(color) {
		if (shown.dot === color) return
		shown.dot = color
		const el = document.getElementById('place')
		el.classList.toggle('dot', !!color)
		if (color) el.style.setProperty('--dot', color)
	}

	const useEl = document.getElementById('use')
	const useAct = document.getElementById('use-act')
	function showUse(action) {
		if (shown.use === action) return
		shown.use = action
		useEl.hidden = !action
		if (action) useAct.src = `/icons/act-${action}.png`
	}

	document.getElementById('bag').style.setProperty('--bottle', `url(${bottleIcon()})`)

	let street = ''
	let toast = null

	return {
		say: (text) => (toast = { text, t: 3 }),

		// `inside` is the shop you're in; `door` is what E does at a shop door.
		// `wasted` is the big word across the screen, WASTED or BUSTED, if any.
		update({ player, cam, bag, showTransit, wasted, inside, door, action, gate, heat = 0 }, dt) {
			minimap(player, !!cam.third, inside, gate)
			if (toast && (toast.t -= dt) < 0) toast = null
			showUse(wasted ? null : action)
			const shopName = door && !door.startsWith('E: ') ? door.split(' · ').pop() : null
			set('money', euro(bag.cents))
			set('bag', bag.bottles ? String(bag.bottles) : '')
			set('heat', '★'.repeat(heat))
			if (inside) {
				set('street', '')
				set('wasted', '')
				set('place', toast?.text ?? shopName ?? '')
				dot(null)
				return
			}
			street = world.streetAt(player.x, player.y) || street
			const p = nearestPlace(world.pois, player.x, player.y, 2.5)
			const stop = showTransit && nearestPlace(world.transit ?? [], player.x, player.y, 2.5)
			set('street', street)
			set('wasted', wasted || '')
			const privat = !p && world.tileAt(player.x, player.y) === T.PRIVATE
			const here = p ? placeName(p) : privat ? 'Privatweg' : ''
			set('place', toast?.text ?? shopName ?? (stop ? stopName(stop) : here))
			dot(toast || shopName ? null : stop ? STOP_DOT[stop.kind] : p ? badgeColor(p.kind) : privat ? PRIVATE_DOT : null)
		},
	}
}

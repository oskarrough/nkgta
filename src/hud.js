// The text overlays: street name, money, bag, nearby place or message.
import { ICONS, nearestPlace, placeName } from './places.js'
import { nearBike } from './player.js'
import { euro } from './pfand.js'
import { T } from './tiles.js'

// What E does right now, for the HUD and the touch button.
export function useHint(player, car) {
	if (player.car) return 'aussteigen'
	if (player.onBike) return 'absteigen'
	if (nearBike(player)) return 'aufs Fahrrad'
	if (car) return car.ai ? 'Auto klauen' : 'einsteigen'
	return null
}

const stopName = (s) => {
	const name = s.kind === 'ubahn' ? `🚇 U ${s.name || 'Bahnhof'}` : `🚏 ${s.name || 'Haltestelle'}`
	return s.lines.length ? `${name} · ${s.lines.join(', ')}` : name
}

export function createHud(world) {
	// Only touch the DOM when text changes; writing it every frame costs a layout.
	const shown = {}
	function set(id, text) {
		if (shown[id] === text) return
		shown[id] = text
		document.getElementById(id).textContent = text
	}

	let street = ''
	let toast = null

	return {
		say: (text) => (toast = { text, t: 3 }),

		// `inside` is the shop you're in; `door` is what E does at a shop door.
		update({ player, car, bag, showTransit, wasted, inside, door }, dt) {
			if (toast && (toast.t -= dt) < 0) toast = null
			set('money', euro(bag.cents))
			set('bag', bag.bottles ? `🍾 ${bag.bottles}` : '')
			if (inside) {
				set('street', '')
				set('wasted', '')
				set('place', toast?.text ?? door ?? '')
				return
			}
			street = world.streetAt(player.x, player.y) || street
			const p = nearestPlace(world.pois, player.x, player.y, 2.5)
			const stop = showTransit && nearestPlace(world.transit ?? [], player.x, player.y, 2.5)
			set('street', street)
			set('wasted', wasted ? 'WASTED' : '')
			const here = p ? `${ICONS[p.kind]} ${placeName(p)}` : world.tileAt(player.x, player.y) === T.PRIVATE ? '🔒 Privatweg' : ''
			const use = useHint(player, car)
			const hint = door ?? (use ? `E: ${use}` : null)
			set('place', toast?.text ?? hint ?? (stop ? stopName(stop) : here))
		},
	}
}

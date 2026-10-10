// The text overlays: street name, money, bag, nearby place or message.
import { ICONS, nearestPlace, placeName } from './places.js'
import { nearBike } from './player.js'
import { euro } from './pfand.js'
import { T } from './tiles.js'

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

		update({ player, bag, showTransit }, dt) {
			street = world.streetAt(player.x, player.y) || street
			if (toast && (toast.t -= dt) < 0) toast = null
			const p = nearestPlace(world.pois, player.x, player.y, 2.5)
			const stop = showTransit && nearestPlace(world.transit ?? [], player.x, player.y, 2.5)
			set('street', street)
			set('money', euro(bag.cents))
			set('bag', bag.bottles ? `🍾 ${bag.bottles}` : '')
			const here = p ? `${ICONS[p.kind]} ${placeName(p)}` : world.tileAt(player.x, player.y) === T.PRIVATE ? '🔒 Privatweg' : ''
			set('place', toast?.text ?? (nearBike(player) ? 'E: aufs Fahrrad' : stop ? stopName(stop) : here))
		},
	}
}

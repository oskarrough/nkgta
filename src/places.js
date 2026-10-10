// Kinds of places on the map, how they look and what they're called.

export const ICONS = {
	spaeti: '🏪',
	doener: '🥙',
	imbiss: '🍟',
	cafe: '☕',
	bar: '🍺',
	restaurant: '🍽️',
	bikeshop: '🔧',
	supermarket: '🛒',
	bakery: '🥐',
	pharmacy: '💊',
	school: '🏫',
	kita: '🧸',
	playground: '🛝',
}

export const LABELS = {
	spaeti: 'Späti',
	doener: 'Döner',
	imbiss: 'Imbiss',
	cafe: 'Café',
	bar: 'Bar',
	restaurant: 'Restaurant',
	bikeshop: 'Fahrradladen',
	supermarket: 'Supermarkt',
	bakery: 'Bäckerei',
	pharmacy: 'Apotheke',
	school: 'Schule',
	kita: 'Kita',
	playground: 'Spielplatz',
}

export const placeName = (p) => p.name || LABELS[p.kind]

// Closest place to (x, y) within `within` tiles, optionally of one kind.
export function nearestPlace(pois, x, y, within, kind) {
	let best = null
	let bestD = within
	for (const p of pois) {
		if (kind && p.kind !== kind) continue
		const d = Math.hypot(p.x - x, p.y - y)
		if (d < bestD) {
			best = p
			bestD = d
		}
	}
	return best
}

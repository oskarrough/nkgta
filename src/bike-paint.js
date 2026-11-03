import { rideKind } from './rides.js'

export const BIKE_PAINTS = [
	{ name: 'Rot', color: '#d23c3c' },
	{ name: 'Blau', color: '#4a7bd0' },
	{ name: 'Gelb', color: '#e8c21a' },
	{ name: 'Grün', color: '#3e7a4a' },
	{ name: 'Rosa', color: '#d65aa0' },
	{ name: 'Creme', color: '#e8e6df' },
]

export function bikeAtShop(player, shop) {
	return (
		!!shop &&
		shop.kind === 'bikeshop' &&
		!player.onBike &&
		!player.car &&
		!player.down &&
		rideKind(player) === 'bike' &&
		Math.hypot(player.bike.x - shop.stand.x, player.bike.y - shop.stand.y) <= 2.5
	)
}

export function paintBike(player, shop, color) {
	if (!bikeAtShop(player, shop) || !BIKE_PAINTS.some((paint) => paint.color === color)) return false
	player.bike.color = color
	return true
}

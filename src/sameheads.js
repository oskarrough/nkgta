export const isSameheads = (shop) => shop?.kind === 'bar' && shop.name === 'Sameheads'

export const DANCE_FLOOR = { x: 2, y: 2.5, width: 8, depth: 3.5 }

export function onDanceFloor(x, y) {
	const floor = DANCE_FLOOR
	return x >= floor.x && x <= floor.x + floor.width && y >= floor.y && y <= floor.y + floor.depth
}

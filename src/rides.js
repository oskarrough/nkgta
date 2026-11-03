import { SURFACE } from './surface.js'

export const RIDES = {
	bike: { name: 'Fahrrad', speed: 3.6, turn: 2.5 },
	skate: { name: 'Skateboard', speed: 2.8, turn: 2.8, push: 1.3, drag: 0.32, surfaces: [1, 0.38, 0.95, 0.8, 0.22] },
	roller: { name: 'Rollschuhe', speed: 2.6, turn: 3.8, push: 1.8, drag: 0.42, surfaces: [1, 0.22, 0.9, 0.7, 0.15] },
	kite: { name: 'Kiteboard', speed: 6.8, turn: 2.2, drag: 0.5, surfaces: [1, 0.65, 1, 0.9, 0.75] },
}

export const rideKind = (p) => p.bike.kind ?? 'bike'
export const skating = (p) => p.onBike && rideKind(p) !== 'bike'
export const rideSurface = (kind, surface) => RIDES[kind].surfaces?.[surface] ?? 1

// Direction of travel of the air, in the map's east/south coordinates.
export function windAt(time) {
	const dir = -Math.PI / 4 + Math.sin(time / 90) * 0.25
	const strength = 0.65 + Math.sin(time / 13) * 0.2
	return { x: Math.cos(dir) * strength, y: Math.sin(dir) * strength }
}

export function kitePull(dir, wind, open) {
	const strength = Math.hypot(wind.x, wind.y)
	if (!open || strength < 0.1) return 0
	const along = (Math.cos(dir) * wind.x + Math.sin(dir) * wind.y) / strength
	return strength * Math.max(0.025, (along + 0.8) / 1.8)
}

export function rideRattle(kind, surface, felt) {
	return felt.rattle * (kind === 'roller' ? 2.5 : kind === 'skate' ? 1.8 : 1) + (surface === SURFACE.grass && kind !== 'kite' ? 0.3 : 0)
}

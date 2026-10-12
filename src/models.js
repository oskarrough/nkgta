// What's on the road. Sizes are tiles (3 m), heights too. Handling numbers
// are per unit of mass: engine and brake in tiles/s², rolling and lateral
// are each tyre's resistance per second, drag is air resistance growing with
// the square of speed and sets the top speed. Mass only matters in crashes.
//
// `look` is the car from above in boxes: [length, width, height, x, z] as
// fractions of the car's length and width, with heights in tiles. Paint is
// the car's colour, glass is dark, lights are the brake lights.

export const MODELS = {
	car: {
		name: '🚗 Kleinwagen',
		noun: 'Auto',
		pace: 1, // how fast its drivers like to go
		length: 1.5,
		width: 0.66,
		mass: 1,
		engine: 5,
		brake: 6,
		rolling: 0.05,
		drag: 0.022,
		lateral: 1.5,
		steer: 0.6,
		steerFade: 0.15,
		colors: ['#b8bcc2', '#1d1f22', '#e8e8e4', '#6b6f75', '#23365c', '#a3231f', '#2f4a3a', '#ede6c8'],
		look: [
			['paint', 1, 1, 0.25, 0, 0.06],
			['glass', 0.55, 0.9, 0.17, -0.03, 0.31],
			['paint', 0.36, 0.84, 0.02, -0.07, 0.48],
		],
	},
	suv: {
		name: '🚙 SUV',
		noun: 'Auto',
		pace: 1.15,
		length: 1.65,
		width: 0.74,
		mass: 1.7,
		engine: 5.5,
		brake: 5,
		rolling: 0.06,
		drag: 0.024,
		lateral: 1.3,
		steer: 0.55,
		steerFade: 0.2,
		colors: ['#111214', '#111214', '#e9e9e6', '#4a4e54'],
		look: [
			['paint', 1, 1, 0.34, 0, 0.08],
			['glass', 0.62, 0.92, 0.2, -0.06, 0.42],
			['paint', 0.52, 0.88, 0.03, -0.08, 0.62],
		],
	},
	lambo: {
		name: '🏎️ Lambo',
		noun: 'Lambo',
		pace: 1.4,
		length: 1.5,
		width: 0.7,
		mass: 0.9,
		engine: 9,
		brake: 8,
		rolling: 0.04,
		drag: 0.012,
		lateral: 2.2,
		steer: 0.55,
		steerFade: 0.12,
		colors: ['#9be22d', '#ff7a00', '#ffd400', '#1a1a1a', '#8a1fd1'],
		look: [
			['paint', 1, 1, 0.18, 0, 0.05],
			['glass', 0.38, 0.8, 0.1, -0.06, 0.23],
			['paint', 0.2, 0.7, 0.02, -0.08, 0.33],
			['paint', 0.06, 0.95, 0.03, -0.47, 0.3], // spoiler
		],
	},
	bus: {
		name: '🚌 Bus',
		noun: 'Bus',
		pace: 0.85,
		length: 4,
		width: 0.85,
		mass: 6,
		engine: 2.2,
		brake: 3.5,
		rolling: 0.05,
		drag: 0.03,
		lateral: 1.4,
		steer: 0.6,
		steerFade: 0.1,
		colors: ['#f0d722'], // BVG yellow
		look: [
			['paint', 1, 1, 0.38, 0, 0.08],
			['glass', 0.98, 0.98, 0.42, 0, 0.46],
			['paint', 0.97, 0.95, 0.04, 0, 0.88],
			['roofbox', 0.25, 0.55, 0.08, -0.15, 0.92],
		],
	},
}

// One in so many cars that pass is something special.
export function pickModel(bigRoad) {
	const r = Math.random()
	if (bigRoad && r < 0.08) return MODELS.bus
	if (r < 0.2) return MODELS.suv
	if (r < 0.24) return MODELS.lambo
	return MODELS.car
}

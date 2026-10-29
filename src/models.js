// What's on the road. Sizes are tiles (3 m), heights too. Handling numbers
// are per unit of mass: engine and brake in tiles/s², rolling and lateral
// are each tyre's resistance per second, drag is air resistance growing with
// the square of speed and sets the top speed. Mass only matters in crashes.
//
// `look` is the car from above in boxes: [length, width, height, x, z, y] as
// fractions of the car's length and width, with heights in tiles; y, to the
// side, is optional. Paint is
// the car's colour, glass is dark, tyres stick out a little past the body.
// The front is +x. Brake lights, headlights and the rim are added for you.
//
// `driver` is how whoever's at the wheel drives in traffic (the Intelligent
// Driver Model, in tiles and seconds): the acceleration they pull away with,
// the braking they find comfortable, the time gap they keep to the car ahead,
// and the gap they leave standing in a queue.

export const MODELS = {
	car: {
		name: 'Kleinwagen',
		noun: 'Auto',
		pace: 1, // how fast its drivers like to go
		driver: { a: 0.8, b: 1.1, T: 1.2, s0: 0.6 },
		length: 1.3,
		width: 0.64,
		mass: 1,
		engine: 5,
		brake: 6,
		rolling: 0.05,
		drag: 0.026,
		lateral: 1.5,
		steer: 0.6,
		steerFade: 0.15,
		colors: ['#b8bcc2', '#1d1f22', '#e8e8e4', '#6b6f75', '#23365c', '#a3231f', '#2f4a3a', '#ede6c8'],
		look: [
			// Short and tall, the roof running right to the hatch.
			['paint', 1, 0.92, 0.25, 0, 0.07],
			['tyre', 0.2, 1.1, 0.16, 0.31, 0],
			['tyre', 0.2, 1.1, 0.16, -0.31, 0],
			['glass', 0.66, 0.88, 0.22, -0.15, 0.32],
			['paint', 0.5, 0.9, 0.03, -0.22, 0.54],
		],
	},
	suv: {
		name: 'SUV',
		noun: 'Auto',
		pace: 1.15,
		driver: { a: 0.8, b: 1.1, T: 1, s0: 0.6 },
		length: 1.75,
		width: 0.8,
		mass: 1.7,
		engine: 5.5,
		brake: 5,
		rolling: 0.06,
		drag: 0.029,
		lateral: 1.3,
		steer: 0.55,
		steerFade: 0.2,
		colors: ['#111214', '#111214', '#e9e9e6', '#4a4e54'],
		look: [
			// A tall square box on big wheels, flat roof with rails.
			['paint', 1, 0.94, 0.36, 0, 0.11],
			['tyre', 0.2, 1.1, 0.25, 0.31, 0],
			['tyre', 0.2, 1.1, 0.25, -0.31, 0],
			['glass', 0.68, 0.92, 0.22, -0.13, 0.47],
			['paint', 0.6, 0.93, 0.03, -0.16, 0.69],
			['roofbox', 0.56, 0.06, 0.05, -0.16, 0.72, 0.4],
			['roofbox', 0.56, 0.06, 0.05, -0.16, 0.72, -0.4],
		],
	},
	lambo: {
		name: 'Lambo',
		noun: 'Lambo',
		pace: 1.4,
		driver: { a: 1.3, b: 1.4, T: 0.8, s0: 0.5 },
		length: 1.65,
		width: 0.8,
		mass: 0.9,
		engine: 9,
		brake: 8,
		rolling: 0.04,
		drag: 0.015,
		lateral: 2.2,
		steer: 0.55,
		steerFade: 0.22,
		colors: ['#9be22d', '#ff7a00', '#ffd400', '#1a1a1a', '#8a1fd1'],
		look: [
			// Flat and wide: a long low nose rising to a small cabin and
			// broad haunches, the wing up on struts behind.
			['paint', 1, 0.9, 0.08, 0, 0.04],
			['tyre', 0.2, 1.08, 0.12, 0.32, 0],
			['tyre', 0.26, 1.14, 0.15, -0.3, 0],
			['paint', 0.55, 1, 0.08, -0.22, 0.12], // haunches
			['paint', 0.4, 0.8, 0.03, 0.29, 0.12], // bonnet
			['glass', 0.12, 0.62, 0.04, 0.12, 0.15], // windscreen
			['glass', 0.3, 0.6, 0.08, -0.05, 0.2],
			['paint', 0.18, 0.56, 0.02, -0.08, 0.28],
			['glass', 0.2, 0.5, 0.01, -0.32, 0.2], // engine cover
			['glass', 0.03, 0.05, 0.1, -0.46, 0.2, 0.3],
			['glass', 0.03, 0.05, 0.1, -0.46, 0.2, -0.3],
			['glass', 0.08, 1, 0.025, -0.46, 0.3], // wing
		],
	},
	bus: {
		name: 'Bus',
		noun: 'Bus',
		pace: 0.85,
		driver: { a: 0.4, b: 0.8, T: 1.5, s0: 0.8 },
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
			['paint', 1, 0.95, 0.38, 0, 0.08],
			['tyre', 0.08, 1.06, 0.2, 0.32, 0],
			['tyre', 0.08, 1.06, 0.2, -0.22, 0],
			['glass', 0.99, 0.97, 0.42, 0, 0.46],
			['paint', 0.9, 0.93, 0.04, -0.045, 0.88],
			['roofbox', 0.25, 0.55, 0.08, -0.15, 0.92],
			['roofbox', 0.12, 0.4, 0.06, 0.2, 0.92],
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

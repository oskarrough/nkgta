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
	golf: {
		name: 'Golf',
		noun: 'Golf',
		pace: 1.05,
		driver: { a: 0.8, b: 1.1, T: 1.1, s0: 0.6 },
		length: 1.45,
		width: 0.66,
		mass: 1.1,
		engine: 5.2,
		brake: 6,
		rolling: 0.05,
		drag: 0.026,
		lateral: 1.5,
		steer: 0.6,
		steerFade: 0.15,
		colors: ['#e8e8e4', '#e8e8e4', '#1d1f22', '#b8bcc2', '#23365c', '#a3231f', '#6b6f75'],
		look: [
			// A hatchback: bonnet, glass cabin with the roof set back, a short boot.
			['paint', 1, 0.92, 0.24, 0, 0.07],
			['tyre', 0.2, 1.1, 0.16, 0.3, 0],
			['tyre', 0.2, 1.1, 0.16, -0.3, 0],
			['glass', 0.5, 0.88, 0.2, -0.08, 0.31],
			['paint', 0.34, 0.9, 0.03, -0.1, 0.51],
		],
	},
	taxi: {
		name: 'Taxi',
		noun: 'Taxi',
		pace: 1.1,
		driver: { a: 0.9, b: 1.2, T: 0.9, s0: 0.5 },
		length: 1.6,
		width: 0.7,
		mass: 1.4,
		engine: 5.5,
		brake: 6,
		rolling: 0.05,
		drag: 0.026,
		lateral: 1.5,
		steer: 0.6,
		steerFade: 0.15,
		colors: ['#efe6c4'], // Mercedes ivory
		look: [
			// An E-Klasse saloon: long bonnet, a boot, and the sign on the roof.
			['paint', 1, 0.92, 0.24, 0, 0.07],
			['tyre', 0.2, 1.1, 0.16, 0.3, 0],
			['tyre', 0.2, 1.1, 0.16, -0.3, 0],
			['glass', 0.5, 0.88, 0.2, -0.08, 0.31],
			['paint', 0.36, 0.9, 0.03, -0.08, 0.51],
			['sign', 0.12, 0.4, 0.06, -0.06, 0.54],
		],
	},
	sprinter: {
		name: 'Sprinter',
		noun: 'Transporter',
		pace: 0.95,
		driver: { a: 0.7, b: 1, T: 1.3, s0: 0.7 },
		length: 2,
		width: 0.74,
		mass: 2.4,
		engine: 4,
		brake: 5,
		rolling: 0.055,
		drag: 0.03,
		lateral: 1.35,
		steer: 0.55,
		steerFade: 0.15,
		colors: ['#f4f3ee', '#f4f3ee', '#f4f3ee', '#b8bcc2', '#23365c', '#111214'],
		look: [
			// One tall slab, the cab a short step down at the front.
			['paint', 1, 0.94, 0.4, 0, 0.08],
			['tyre', 0.16, 1.08, 0.2, 0.32, 0],
			['tyre', 0.16, 1.08, 0.2, -0.3, 0],
			['glass', 0.22, 0.9, 0.12, 0.32, 0.46],
			['paint', 0.76, 0.94, 0.08, -0.12, 0.48],
			['roofbox', 0.5, 0.06, 0.04, -0.14, 0.56, 0.3],
			['roofbox', 0.5, 0.06, 0.04, -0.14, 0.56, -0.3],
		],
	},
	bsr: {
		name: 'BSR-Müllwagen',
		noun: 'Müllwagen',
		pace: 0.8,
		driver: { a: 0.5, b: 0.9, T: 1.4, s0: 0.8 },
		length: 2.5,
		width: 0.84,
		mass: 4.5,
		engine: 2.8,
		brake: 4,
		rolling: 0.055,
		drag: 0.032,
		lateral: 1.35,
		steer: 0.55,
		steerFade: 0.12,
		colors: ['#ff6a00'], // BSR orange
		look: [
			// A cab at the front and a long tall box behind it with a hopper at the back.
			['paint', 1, 0.94, 0.34, 0, 0.1],
			['tyre', 0.1, 1.06, 0.22, 0.34, 0],
			['tyre', 0.1, 1.06, 0.22, -0.28, 0],
			['glass', 0.2, 0.9, 0.12, 0.38, 0.44],
			['paint', 0.66, 0.96, 0.28, -0.14, 0.44],
			['roofbox', 0.2, 0.7, 0.06, -0.4, 0.72],
			['roofbox', 0.3, 0.5, 0.04, -0.1, 0.72],
		],
	},
	trabi: {
		name: 'Trabi',
		noun: 'Trabi',
		pace: 0.75,
		driver: { a: 0.6, b: 1, T: 1.4, s0: 0.6 },
		length: 1.2,
		width: 0.6,
		mass: 0.8,
		engine: 3.4,
		brake: 5,
		rolling: 0.05,
		drag: 0.028,
		lateral: 1.4,
		steer: 0.6,
		steerFade: 0.15,
		colors: ['#c9b98a', '#8aa0b4', '#7a9a6a', '#d8d2c0', '#b8553a'],
		look: [
			// A small square box, glass all round, the roof set well forward.
			['paint', 1, 0.9, 0.22, 0, 0.07],
			['tyre', 0.2, 1.1, 0.15, 0.3, 0],
			['tyre', 0.2, 1.1, 0.15, -0.3, 0],
			['glass', 0.6, 0.86, 0.2, -0.06, 0.29],
			['paint', 0.5, 0.88, 0.03, -0.06, 0.49],
		],
	},
	police: {
		name: 'Polizei',
		noun: 'Dienstwagen',
		pace: 1.6,
		driver: { a: 1.4, b: 1.6, T: 0.7, s0: 0.5 },
		length: 1.8,
		width: 0.72,
		mass: 2.2,
		engine: 7,
		brake: 7,
		rolling: 0.05,
		drag: 0.024,
		lateral: 1.7,
		steer: 0.6,
		steerFade: 0.14,
		colors: ['#d8dde3'], // silver, the blue band and the light bar on top
		look: [
			// A VW bus: one tall box, glass all round, the blue band at waist height.
			['paint', 1, 0.94, 0.42, 0, 0.08],
			['tyre', 0.16, 1.08, 0.2, 0.32, 0],
			['tyre', 0.16, 1.08, 0.2, -0.3, 0],
			['blue', 1.01, 0.97, 0.1, 0, 0.2],
			['glass', 0.9, 0.9, 0.14, -0.04, 0.5],
			['paint', 0.84, 0.92, 0.04, -0.06, 0.64],
			['beacon', 0.14, 0.8, 0.08, 0.1, 0.68],
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
	dhl: {
		name: 'DHL-Transporter',
		noun: 'Paketwagen',
		pace: 1,
		driver: { a: 0.8, b: 1.2, T: 1, s0: 0.5 },
		length: 2,
		width: 0.74,
		mass: 2.3,
		engine: 4,
		brake: 5,
		rolling: 0.055,
		drag: 0.03,
		lateral: 1.35,
		steer: 0.55,
		steerFade: 0.15,
		colors: ['#ffcc00'], // DHL yellow, the red band round the box
		look: [
			// A Sprinter in yellow, a red band round the box, a bare roof.
			['paint', 1, 0.94, 0.4, 0, 0.08],
			['tyre', 0.16, 1.08, 0.2, 0.32, 0],
			['tyre', 0.16, 1.08, 0.2, -0.3, 0],
			['red', 0.72, 0.96, 0.07, -0.13, 0.3],
			['glass', 0.22, 0.9, 0.12, 0.32, 0.46],
			['paint', 0.76, 0.94, 0.08, -0.12, 0.48],
		],
	},
	merc190: {
		name: 'Mercedes 190',
		noun: 'Benz',
		pace: 1.05,
		driver: { a: 0.9, b: 1.2, T: 0.9, s0: 0.5 },
		length: 1.5,
		width: 0.66,
		mass: 1.3,
		engine: 4.8,
		brake: 5.5,
		rolling: 0.05,
		drag: 0.027,
		lateral: 1.45,
		steer: 0.6,
		steerFade: 0.15,
		colors: ['#e9e4d6', '#1d1f22', '#7d1d1d', '#5c6b74', '#c9c6bd'],
		look: [
			// The old saloon: a low box, flat bonnet and boot, a square cabin
			// in the middle, a little red flag clipped to the back window.
			['paint', 1, 0.92, 0.2, 0, 0.07],
			['tyre', 0.2, 1.1, 0.15, 0.3, 0],
			['tyre', 0.2, 1.1, 0.15, -0.3, 0],
			['glass', 0.42, 0.88, 0.18, -0.03, 0.27],
			['paint', 0.34, 0.9, 0.03, -0.03, 0.45],
			['red', 0.1, 0.03, 0.07, -0.16, 0.38, 0.5],
		],
	},
	smart: {
		name: 'Smart',
		noun: 'Smart',
		pace: 1,
		driver: { a: 0.9, b: 1.2, T: 1, s0: 0.4 },
		length: 0.9,
		width: 0.6,
		mass: 0.75,
		engine: 4.6,
		brake: 6,
		rolling: 0.05,
		drag: 0.03,
		lateral: 1.3,
		steer: 0.7,
		steerFade: 0.12,
		colors: ['#e8e8e4', '#d92b2b', '#ffd400', '#3a7bd5', '#1d1f22'],
		look: [
			// Two seats and no more: a tall stub in a silver cage.
			['paint', 1, 0.92, 0.26, 0, 0.07],
			['tyre', 0.24, 1.1, 0.16, 0.3, 0],
			['tyre', 0.24, 1.1, 0.16, -0.3, 0],
			['roofbox', 0.62, 0.92, 0.22, -0.1, 0.32],
			['glass', 0.66, 0.84, 0.2, -0.08, 0.33],
			['paint', 0.5, 0.88, 0.03, -0.12, 0.54],
		],
	},
	cargo: {
		name: 'Lastenrad',
		noun: 'Lastenrad',
		pace: 0.45,
		driver: { a: 0.5, b: 1, T: 1.2, s0: 0.4 },
		length: 0.9,
		width: 0.3,
		mass: 0.35,
		engine: 2.4,
		brake: 4,
		rolling: 0.05,
		drag: 0.05,
		lateral: 1.6,
		steer: 0.75,
		steerFade: 0.1,
		colors: ['#a87a4a', '#2f4a3a', '#23365c', '#d8d2c0'],
		look: [
			// A long low frame, the box out front with a kid's head or a crate
			// in it, the rider up on the saddle behind.
			['tyre', 1, 0.25, 0.03, 0, 0.12],
			['tyre', 0.18, 0.3, 0.13, 0.4, 0],
			['tyre', 0.18, 0.3, 0.13, -0.4, 0],
			['paint', 0.42, 1, 0.18, 0.2, 0.08],
			['glass', 0.22, 0.8, 0.3, -0.24, 0.18],
		],
	},
}

// What drives past, as shares of all cars: the plain Kleinwagen takes what's
// left. Vans come out to deliver in the morning, taxis wait by the U-Bahn,
// buses, cops and bin lorries keep to the big roads, cargo bikes to the small.
// Parked cars leave out what doesn't park.
const MORNING = [6, 11] // hours vans are out in force
function mixOf({ bigRoad = false, parked = false, hour = 12, station = false } = {}) {
	const morning = hour >= MORNING[0] && hour < MORNING[1]
	const moving = !parked
	return [
		[MODELS.bus, bigRoad && moving ? 0.08 : 0],
		[MODELS.police, bigRoad && moving ? 0.015 : 0],
		[MODELS.bsr, moving ? 0.025 : 0],
		[MODELS.cargo, moving ? (bigRoad ? 0.015 : 0.04) : 0],
		[MODELS.taxi, (bigRoad ? 0.07 : 0.035) * (station ? 3 : 1)],
		[MODELS.sprinter, morning ? 0.15 : 0.06],
		[MODELS.dhl, morning ? 0.07 : 0.025],
		[MODELS.suv, 0.11],
		[MODELS.lambo, 0.025],
		[MODELS.golf, 0.1],
		[MODELS.trabi, 0.03],
		[MODELS.merc190, 0.04],
		[MODELS.smart, 0.045],
	]
}

export function pickModel(r = Math.random(), where = {}) {
	for (const [model, share] of mixOf(where)) if ((r -= share) < 0) return model
	return MODELS.car
}

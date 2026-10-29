// What the ground is made of, and what that does to feet, tyres and the view.
// Numbers are multipliers, small on purpose: 1 is no change.
import { T } from './tiles.js'

export const SURFACE = { asphalt: 0, sett: 1, paving: 2, hof: 3, grass: 4 }

const FEEL = {
	[SURFACE.asphalt]: { bike: 1, foot: 1, roll: 1, grip: 1, rattle: 0 },
	// Kopfstein: a bike loses a little pace, a car a lot of grip, and both shake.
	[SURFACE.sett]: { bike: 0.9, foot: 0.94, roll: 1.55, grip: 0.78, rattle: 1 },
	// Pavement slabs and squares: nearly as good as tarmac under a wheel.
	[SURFACE.paving]: { bike: 1, foot: 1, roll: 1.12, grip: 0.96, rattle: 0.12 },
	// A Hinterhof: bikes keep their speed here, cars bog down a little.
	[SURFACE.hof]: { bike: 1, foot: 0.97, roll: 1.6, grip: 0.85, rattle: 0.35 },
	[SURFACE.grass]: { bike: 0.55, foot: 0.88, roll: 3, grip: 0.62, rattle: 0.3 },
}

// Some cars mind rough ground more. The Lambo is low and stiff: setts knock
// it off line. The van is soft and heavy: it grips late, behind its steering,
// and rolls over the stones like a boat.
const TAKES = {
	Lambo: { grip: 1.6, roll: 1.3, steer: 0.8, rattle: 1.5 },
	Sprinter: { grip: 0.8, roll: 1.15, steer: 0.45, rattle: 0.75 },
	'BSR-Müllwagen': { grip: 0.9, roll: 1.1, steer: 0.8, rattle: 0.7 },
	Bus: { grip: 0.9, roll: 1.05, steer: 0.85, rattle: 0.6 },
	Trabi: { grip: 1.15, roll: 1.1, steer: 1, rattle: 1.1 },
}
const NEUTRAL = { grip: 1, roll: 1, steer: 1, rattle: 1 }

const feels = new WeakMap()
function compute(model, surface) {
	const f = FEEL[surface] ?? FEEL[SURFACE.asphalt]
	const t = TAKES[model.name] ?? NEUTRAL
	// A model minds the rough part of a surface, not how fast it is.
	const rough = f.rattle
	return {
		...f,
		grip: 1 - (1 - f.grip) * t.grip,
		roll: 1 + (f.roll - 1) * t.roll,
		steer: 1 - (1 - t.steer) * rough,
		rattle: f.rattle * t.rattle,
	}
}

// Worked out once per model and surface. Pass no model on foot.
export function feelOn(model, surface) {
	if (!model) return FEEL[surface] ?? FEEL[SURFACE.asphalt]
	let bySurface = feels.get(model)
	if (!bySurface) feels.set(model, (bySurface = []))
	return (bySurface[surface] ??= compute(model, surface))
}

export function surfaceAt(world, x, y) {
	const ground = world.tileAt(x, y)
	if (ground === T.ROAD || ground === T.CYCLEWAY) return world.cobbled?.(x, y) ? SURFACE.sett : SURFACE.asphalt
	if (ground === T.GRASS || ground === T.PITCH) return SURFACE.grass
	if (ground === T.GROUND) return SURFACE.hof
	return SURFACE.paving
}

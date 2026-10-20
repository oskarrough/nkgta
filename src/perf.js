// Timings, with ?perf in the URL: how long each load phase took, and per
// frame what each render pass costs. Passes are waited out by reading back
// a pixel (gl.finish doesn't wait everywhere), so the GPU's share counts
// too; that slows the game a little, so it's off unless asked for. Read them from window.perf in the console.
export const PERF = new URLSearchParams(location.search).has('perf')

const perf = { phases: [], frames: [], frame: null }
if (PERF) globalThis.perf = perf

let last = performance.now()
// Ends a load phase: the time since the previous one ended.
export function phase(name) {
	const now = performance.now()
	if (PERF) perf.phases.push([name, Math.round(now - last)])
	last = now
}

// Times every render call and the shadow map in it, as named passes: each
// frame's first calls get `names`, any after them count as 'extra'.
let call = 0
export function timePasses(renderer, names) {
	if (!PERF) return
	const gl = renderer.getContext()
	const pixel = new Uint8Array(4)
	const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
	const timed = (fn, name) =>
		function (...args) {
			const n = typeof name === 'function' ? name() : name
			sync()
			const t = performance.now()
			const before = renderer.info.render.triangles
			const out = fn.apply(this, args)
			sync()
			const f = perf.frame
			if (f) {
				f[n] = (f[n] ?? 0) + performance.now() - t
				// render() starts its count afresh, the shadow map adds to it.
				const tris = renderer.info.render.triangles - (n === 'shadow' ? before : 0)
				f.triangles[n] = (f.triangles[n] ?? 0) + tris
			}
			return out
		}
	const shadow = renderer.shadowMap.render
	renderer.shadowMap.render = timed(shadow, 'shadow')
	const render = renderer.render
	renderer.render = timed(render, () => names[call++] ?? 'extra')
}

// Adds to a number kept for this frame, like time spent on something.
export function note(name, value) {
	if (PERF && perf.frame) perf.frame[name] = (perf.frame[name] ?? 0) + value
}

export function frameStart() {
	if (!PERF) return
	perf.frame = { start: performance.now(), triangles: {} }
	call = 0
	// A test can steer from here, say to drive a fixed route frame by frame.
	perf.before?.()
}

export function frameEnd(extra) {
	if (!PERF || !perf.frame) return
	const f = perf.frame
	f.total = performance.now() - f.start
	Object.assign(f, extra)
	perf.frames.push(f)
	if (perf.frames.length > 5000) perf.frames.shift()
	perf.frame = null
}

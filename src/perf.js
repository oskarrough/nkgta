// Timings with ?perf: CPU wall time and asynchronous GPU pass queries.
// GPU fields arrive a few frames later; absent means unavailable, not zero.
// Color excludes shadows on the GPU; CPU render timings include nested calls.
// Read window.perf in the console.
export const PERF = new URLSearchParams(globalThis.location?.search).has('perf')

const perf = { phases: [], frames: [], frame: null }
if (PERF) globalThis.perf = perf

let last = performance.now()
export function phase(name) {
	const now = performance.now()
	if (PERF) perf.phases.push([name, Math.round(now - last)])
	last = now
}

// GPU queries cannot nest. Split the enclosing color pass around shadow
// rendering, then add its segments once every result is available.
let call = 0
const pollers = []
export function timePasses(renderer, names) {
	if (!PERF) return
	const gl = renderer.getContext()
	const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
	perf.gpuTimers = !!ext
	const pending = []
	let batch = null
	let active = null
	const stack = []
	function stop() {
		if (!active) return
		gl.endQuery(ext.TIME_ELAPSED_EXT)
		active = null
	}
	function start(name) {
		if (!batch) return
		const query = gl.createQuery()
		gl.beginQuery(ext.TIME_ELAPSED_EXT, query)
		batch.queries.push({ query, name })
		active = query
	}
	pollers.push(() => {
		if (!ext) return
		if (gl.isContextLost()) {
			pending.length = 0
			return
		}
		const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
		for (let i = 0; i < pending.length;) {
			const item = pending[i]
			if (!disjoint && !item.queries.every(({ query }) => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE))) {
				i++
				continue
			}
			for (const { query, name } of item.queries) {
				if (!disjoint) item.frame[name] = (item.frame[name] ?? 0) + gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
				gl.deleteQuery(query)
			}
			pending.splice(i, 1)
		}
	})
	const timed = (fn, name) =>
		function (...args) {
			const f = perf.frame
			if (!f) return fn.apply(this, args)
			const n = typeof name === 'function' ? name() : name
			const outer = stack.length === 0
			if (outer && ext && !gl.isContextLost() && pending.length < 64) batch = { frame: f, queries: [] }
			stop()
			stack.push(n)
			start(n)
			const t = performance.now()
			const before = renderer.info.render.triangles
			try {
				return fn.apply(this, args)
			} finally {
				f.cpu[n] = (f.cpu[n] ?? 0) + performance.now() - t
				const tris = renderer.info.render.triangles - (n === 'shadow' ? before : 0)
				f.triangles[n] = (f.triangles[n] ?? 0) + tris
				stop()
				stack.pop()
				if (outer) {
					if (batch) pending.push(batch)
					batch = null
				} else start(stack.at(-1))
			}
		}
	renderer.shadowMap.render = timed(renderer.shadowMap.render, 'shadow')
	renderer.render = timed(renderer.render, () => names[call++] ?? 'extra')
}

export function note(name, value) {
	if (PERF && perf.frame) perf.frame[name] = (perf.frame[name] ?? 0) + value
}

export function frameStart() {
	if (!PERF) return
	perf.frame = { start: performance.now(), triangles: {}, cpu: {} }
	for (const poll of pollers) poll()
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

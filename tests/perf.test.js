import { expect, test } from 'bun:test'

let serial = 0
async function setup(supported = true) {
	const previous = globalThis.location
	globalThis.location = { search: '?perf' }
	const timer = await import(`../src/perf.js?test=${serial++}`)
	globalThis.location = previous
	let active = null
	let disjoint = false
	const queries = []
	const gl = {
		QUERY_RESULT_AVAILABLE: 1,
		QUERY_RESULT: 2,
		getExtension: () => (supported ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null),
		isContextLost: () => false,
		getParameter: () => disjoint,
		createQuery() {
			const query = { ready: false, deleted: false }
			queries.push(query)
			return query
		},
		beginQuery(_, query) {
			expect(active).toBeNull()
			active = query
		},
		endQuery() {
			expect(active).not.toBeNull()
			active = null
		},
		getQueryParameter(query, param) {
			if (param === 1) return query.ready
			expect(query.ready).toBe(true)
			return 1e6
		},
		deleteQuery: (query) => (query.deleted = true),
	}
	const renderer = {
		getContext: () => gl,
		info: { render: { triangles: 0 } },
		shadowMap: { render() {} },
		render() {
			this.shadowMap.render()
			return 42
		},
	}
	timer.timePasses(renderer, ['color'])
	return { timer, renderer, queries, disjoint: () => (disjoint = true), perf: globalThis.perf }
}

test('GPU timing waits for availability, splits nested shadows, and retains the originating frame', async () => {
	const { timer, renderer, queries, perf } = await setup()
	timer.frameStart()
	expect(renderer.render()).toBe(42)
	timer.frameEnd({})
	const first = perf.frames[0]
	timer.frameStart()
	expect(first.color).toBeUndefined()
	for (const q of queries) q.ready = true
	timer.frameEnd({})
	timer.frameStart()
	expect(first.color).toBe(2)
	expect(first.shadow).toBe(1)
	expect(perf.frame.color).toBeUndefined()
	expect(queries.every((q) => q.deleted)).toBe(true)
})

test('disjoint measurements are discarded instead of reported as GPU time', async () => {
	const { timer, renderer, queries, disjoint, perf } = await setup()
	timer.frameStart()
	renderer.render()
	timer.frameEnd({})
	disjoint()
	timer.frameStart()
	expect(perf.frames[0].color).toBeUndefined()
	expect(queries.every((q) => q.deleted)).toBe(true)
})

test('without the extension CPU timing still works and GPU time stays unavailable', async () => {
	const { timer, renderer, queries, perf } = await setup(false)
	timer.frameStart()
	renderer.render()
	timer.frameEnd({})
	expect(perf.frames[0].cpu.color).toBeGreaterThanOrEqual(0)
	expect(perf.frames[0].color).toBeUndefined()
	expect(queries).toHaveLength(0)
})

test('a GPU that never answers cannot grow the query queue without bound', async () => {
	const { timer, renderer, queries, perf } = await setup()
	for (let i = 0; i < 100; i++) {
		timer.frameStart()
		renderer.render()
		timer.frameEnd({})
	}
	expect(queries.length).toBe(64 * 3)
	expect(perf.frames.at(-1).color).toBeUndefined()
	expect(perf.frames.at(-1).cpu.color).toBeGreaterThanOrEqual(0)
})

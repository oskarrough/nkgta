// Phone memory: bun scripts/memory.js [--root checkout] [--out /tmp/prefix]
// Samples JS heaps including workers and estimates WebGL bytes at DPR 3.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`)
	return i < 0 ? fallback : args.splice(i, 2)[1]
}
const root = flag('root', process.cwd())
const output = flag('out', join(tmpdir(), `nkgta-memory-${process.pid}`))
const MiB = 2 ** 20
const BUDGET = { cpu: 450 * MiB, gpu: 256 * MiB, total: 650 * MiB }
const base = flag('url')
const screenshot = flag('screenshot')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function freePort() {
	const probe = Bun.serve({ port: 0, fetch: () => new Response() })
	const port = probe.port
	await probe.stop(true)
	return port
}

const profile = mkdtempSync(join(tmpdir(), 'nkgta-perf-'))
let server, chrome, socket
async function cleanup() {
	try {
		socket?.close()
	} catch {}
	chrome?.kill()
	await chrome?.exited
	await server?.close()
	rmSync(profile, { recursive: true, force: true })
}
process.on('SIGINT', () => cleanup().then(() => process.exit(130)))

try {
	let url = base
	if (!url) {
		const port = await freePort()
		server = await createServer({ root, server: { port, strictPort: true }, logLevel: 'silent' })
		await server.listen()
		url = `http://localhost:${port}/`
	}

	const debugPort = await freePort()
	chrome = Bun.spawn(
		[
			'chromium-browser',
			'--headless=new',
			'--enable-gpu',
			'--disable-extensions',
			'--ignore-gpu-blocklist',
			'--use-angle=gl',
			'--window-size=1280,800',
			`--remote-debugging-port=${debugPort}`,
			`--user-data-dir=${profile}`,
			'about:blank',
		],
		{ stdout: 'ignore', stderr: 'ignore' },
	)
	let target
	for (let i = 0; i < 50 && !target; i++) {
		await sleep(200)
		target = await fetch(`http://127.0.0.1:${debugPort}/json`)
			.then((r) => r.json())
			.then((tabs) => tabs.find((t) => t.type === 'page'))
			.catch(() => null)
	}
	if (!target) throw new Error('Chromium did not start')

	socket = new WebSocket(target.webSocketDebuggerUrl)
	await new Promise((open) => (socket.onopen = open))
	let id = 0
	const waiting = new Map()
	const workerSessions = new Map()
	socket.onmessage = ({ data }) => {
		const msg = JSON.parse(data)
		if (msg.method === 'Target.attachedToTarget' && msg.params.targetInfo.type === 'worker')
			workerSessions.set(msg.params.sessionId, msg.params.targetInfo.url)
		if (msg.method === 'Target.detachedFromTarget') workerSessions.delete(msg.params.sessionId)
		waiting.get(msg.id)?.(msg)
		waiting.delete(msg.id)
	}
	const send = (method, params, sessionId) =>
		new Promise((done) => {
			const request = ++id
			const timeout = setTimeout(() => {
				waiting.delete(request)
				done({ error: { message: `${method} timed out; the tab may have crashed` } })
			}, 20000)
			waiting.set(request, (message) => {
				clearTimeout(timeout)
				done(message)
			})
			socket.send(JSON.stringify({ id, method, params, sessionId }))
		}).then((msg) => {
			if (msg.error) throw new Error(`${method}: ${msg.error.message}`)
			return msg.result
		})
	const run = async (expression) => {
		const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
		if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
		return result.value
	}

	const gpu = await run(`(() => {
		const gl = document.createElement('canvas').getContext('webgl2')
		const info = gl.getExtension('WEBGL_debug_renderer_info')
		return gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
	})()`)
	console.log(`GPU: ${gpu}`)
	if (!/radeon/i.test(gpu)) console.log('Not the Radeon: these are software numbers, ignore them.')

	await send('Page.enable')
	await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
	await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
	await send('Emulation.setTouchEmulationEnabled', { enabled: true })
	await send('Emulation.setHardwareConcurrencyOverride', { hardwareConcurrency: 6 })
	await send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(new URL('./memory-probe.js', import.meta.url), 'utf8') })
	await send('Page.navigate', { url: `${url}?perf&hour=11` })
	const samples = []
	const workerHeap = async () => {
		const heaps = []
		for (const [sessionId, url] of workerSessions) {
			const h = await send('Runtime.getHeapUsage', {}, sessionId).catch(() => null)
			if (h) heaps.push({ url, ...h })
		}
		return heaps
	}
	const sample = async () => {
		const heap = await send('Runtime.getHeapUsage')
		const workers = await workerHeap()
		const view = await run(`(() => {
			if (!globalThis.game) return { loading: document.querySelector('#loading')?.textContent }
			const { city3d, player } = game
			const geometries = new Set(), buffers = new Set()
			city3d.scene.traverse(o => {
				if (o.geometry) {
					geometries.add(o.geometry)
					for (const a of Object.values(o.geometry.attributes)) buffers.add((a.array ?? a.data?.array)?.buffer)
					if (o.geometry.index) buffers.add(o.geometry.index.array.buffer)
				}
				for (const a of [o.instanceMatrix, o.instanceColor]) if (a) buffers.add(a.array.buffer)
			})
			return { gpu: memoryProbe(), info: city3d.renderer.info.memory, geometryCpuBytes: [...buffers].reduce((s,b)=>s+(b?.byteLength??0),0), sceneGeometries: geometries.size, chunks: city3d.chunks.stats(), player: {x:player.x,y:player.y,onBike:player.onBike}, touch:matchMedia('(pointer: coarse)').matches, dpr:devicePixelRatio }
		})()`)
		const value = { at: Date.now(), heap, workers, ...view }
		samples.push(value)
		return value
	}
	let loaded
	for (let i = 0; i < 180; i++) {
		await sample()
		if (await run('globalThis.perf?.frames.length > 0')) {
			loaded = samples.at(-1)
			break
		}
		await sleep(500)
	}
	if (!loaded) throw new Error('Never loaded')
	console.log('phone    390×844 @ DPR 3, sampling a 60-second ride…')
	// A fixed 60-second bicycle-speed route along Karl-Marx-Strasse. The
	// position is driven so random traffic cannot change texture coverage.
	await run(`(() => {
		const points = [{lat:52.4764,lon:13.4397},{lat:52.4784,lon:13.4379},{lat:52.4810,lon:13.4347}].map(p => game.world.startPoint(p))
		const start = performance.now()
		globalThis.memoryRide = setInterval(() => {
			const f = Math.min(1,(performance.now()-start)/60000)*2
			const i = Math.min(1, Math.floor(f)), t = f-i, a = points[i], b=points[i+1]
			Object.assign(game.player, { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, dir:Math.atan2(b.y-a.y,b.x-a.x), onBike:true })
		}, 16)
	})()`)
	const start = Date.now()
	while (Date.now() - start < 60000) {
		await sleep(500)
		await sample()
	}
	await run('clearInterval(memoryRide)')
	if (screenshot)
		await send('Page.captureScreenshot', { format: 'png' }).then((r) => writeFileSync(screenshot, Buffer.from(r.data, 'base64')))
	const end = samples.at(-1)
	const cpuBytes = (s) =>
		s.heap.usedSize + (s.heap.backingStorageSize ?? 0) + s.workers.reduce((n, w) => n + w.usedSize + (w.backingStorageSize ?? 0), 0)
	const summary = {
		gpu,
		loaded,
		end,
		peakMain: Math.max(...samples.map((s) => s.heap.usedSize)),
		peakMainBacking: Math.max(...samples.map((s) => s.heap.backingStorageSize ?? 0)),
		peakWorkers: Math.max(...samples.map((s) => s.workers.reduce((n, w) => n + w.usedSize + (w.backingStorageSize ?? 0), 0))),
		peakCombined: Math.max(...samples.map(cpuBytes)),
		peakTotal: Math.max(...samples.map((s) => cpuBytes(s) + (s.gpu?.total ?? 0))),
		peakGpu: Math.max(...samples.map((s) => s.gpu?.total ?? 0)),
	}
	if (!end.touch || end.dpr !== 3 || !end.workers.some((w) => w.url.includes('/paint-worker.js')) || !Number.isFinite(summary.peakTotal))
		throw new Error('Incomplete phone memory measurement')
	writeFileSync(`${output}.json`, JSON.stringify({ summary, samples }, null, 2))
	const mb = (n) => (n / MiB).toFixed(1)
	console.log(
		`          peak main JS ${mb(summary.peakMain)} MiB; main backing ${mb(summary.peakMainBacking)}; workers ${mb(summary.peakWorkers)}`,
	)
	console.log(
		`          CPU ${mb(summary.peakCombined)} / ${mb(BUDGET.cpu)} MiB; WebGL estimate ${mb(summary.peakGpu)} / ${mb(BUDGET.gpu)}; combined ${mb(summary.peakTotal)} / ${mb(BUDGET.total)}`,
	)
	console.log(`          samples: ${output}.json`)
	if (summary.peakCombined > BUDGET.cpu || summary.peakGpu > BUDGET.gpu || summary.peakTotal > BUDGET.total)
		throw new Error('PHONE MEMORY BUDGET EXCEEDED')
	console.log('          phone memory budget PASS')
} finally {
	await cleanup()
}

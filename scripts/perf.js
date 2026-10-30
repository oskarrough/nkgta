// Frame timings on the real GPU, in one command, for anyone who changes how
// the game draws.
// Usage: bun run perf [url-params] [--url <base>] [--cam top|chase] [--seconds 10]
// Add --profile <path-prefix> to save a CDP CPU profile per camera.
// Starts its own Vite (or uses --url), drives headless Chromium over CDP, and
// prints median and p95 frame ms for the overhead and the chase camera, at
// 11:00 from the same spot. Extra url-params ("hour=20") are added to ?perf.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`)
	return i < 0 ? fallback : args.splice(i, 2)[1]
}
const base = flag('url')
const only = flag('cam')
const cpuProfile = flag('profile')
const seconds = Number(flag('seconds', 10))
const settle = Number(flag('settle', 3))
const extra = args.join('&')
const views = only ? [only] : ['top', 'chase']
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
		server = await createServer({ server: { port, strictPort: true }, logLevel: 'silent' })
		await server.listen()
		url = `http://localhost:${port}/`
	}

	const debugPort = await freePort()
	chrome = Bun.spawn(
		[
			'chromium-browser',
			'--headless=new',
			'--enable-gpu',
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
	socket.onmessage = ({ data }) => {
		const msg = JSON.parse(data)
		waiting.get(msg.id)?.(msg)
		waiting.delete(msg.id)
	}
	const send = (method, params) =>
		new Promise((done) => {
			waiting.set(++id, done)
			socket.send(JSON.stringify({ id, method, params }))
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

	const median = (xs, p = 0.5) => xs.toSorted((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]
	const ms = (n) => (n == null ? 'n/a' : n.toFixed(1))
	const PASSES = ['shadow', 'color', 'ink', 'blit']
	for (const cam of views) {
		const query = ['perf', 'hour=11', `cam=${cam === 'chase' ? 'chase' : 'top'}`, extra].filter(Boolean).join('&')
		await send('Page.navigate', { url: `${url}?${query}` })
		// Wait for the first frame (the map loads first), let it settle, then sample afresh.
		for (let i = 0; ; i++) {
			if (i > 300) throw new Error('The game never drew a frame')
			await sleep(200)
			if (await run('globalThis.perf?.frames.length > 0').catch(() => false)) break
		}
		await sleep(settle * 1000)
		await run('perf.frames.length = 0')
		if (cpuProfile) {
			await send('Profiler.enable')
			await send('Profiler.start')
		}
		await sleep(seconds * 1000)
		if (cpuProfile) {
			const { profile } = await send('Profiler.stop')
			writeFileSync(`${cpuProfile}-${cam}.cpuprofile`, JSON.stringify(profile))
		}
		const frames = await run(
			'perf.frames.map(f => ({ interval: f.interval, total: f.total, shadow: f.shadow, color: f.color, ink: f.ink, blit: f.blit, cpu: f.cpu }))',
		)
		const gaps = frames.map((f) => f.interval)
		const work = frames.map((f) => f.total)
		const passes = PASSES.map((p) => {
			const samples = frames.map((f) => f[p]).filter(Number.isFinite)
			return `${p} ${ms(median(samples))} (${samples.length})`
		}).join(', ')
		const label = cam === 'chase' ? 'chase   ' : 'overhead'
		console.log(`${label}  frame ${ms(median(gaps))} / ${ms(median(gaps, 0.95))} ms (median / p95), ${frames.length} frames`)
		console.log(`          work ${ms(median(work))} / ${ms(median(work, 0.95))} ms; GPU ms (exclusive, sample count): ${passes}`)
	}
} finally {
	await cleanup()
}

// Release this browser before the phone pass so the measurements don't compete.
const phone = Bun.spawn(['bun', new URL('./memory.js', import.meta.url).pathname, ...(base ? ['--url', base] : [])], {
	stdout: 'inherit',
	stderr: 'inherit',
})
process.removeAllListeners('SIGINT')
process.on('SIGINT', () => phone.kill('SIGINT'))
if (await phone.exited) process.exit(1)

// Quiet street audio. Every source reaches the same master, including delayed cues.
let context
let master
let noise
let playerVoice
let muted = false
try {
	muted = localStorage.getItem('nk-leise') === 'true'
} catch {
	// Sound still works when browser storage is unavailable.
}
const events = []
const note = (kind, gain) => {
	events.push({ kind, gain: +gain.toFixed(4) })
	if (events.length > 24) events.shift()
}
const smooth = (param, value, time = 0.1) => param.setTargetAtTime(value, context.currentTime, time)

function start() {
	if (!context) {
		context = new AudioContext()
		master = context.createGain()
		master.gain.value = muted ? 0 : 0.22
		master.connect(context.destination)
		noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
		const data = noise.getChannelData(0)
		for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
	}
	if (context.state === 'suspended') context.resume().catch(() => {})
}

function noiseSource() {
	const source = context.createBufferSource()
	source.buffer = noise
	source.loop = true
	return source
}

function voice() {
	const motor = context.createOscillator()
	motor.type = 'sawtooth'
	const filter = context.createBiquadFilter()
	filter.type = 'lowpass'
	const gain = context.createGain()
	gain.gain.value = 0
	const grit = noiseSource()
	const gritGain = context.createGain()
	gritGain.gain.value = 0
	const pan = context.createStereoPanner()
	motor.connect(filter)
	grit.connect(gritGain).connect(filter)
	filter.connect(gain).connect(pan).connect(master)
	motor.start()
	grit.start()
	return { motor, filter, gain, grit, gritGain, pan }
}

function stopVoice(v) {
	if (!v) return
	const end = context.currentTime + 0.2
	smooth(v.gain.gain, 0, 0.025)
	v.motor.stop(end)
	v.grit.stop(end)
	v.motor.onended = () => {
		for (const node of [v.motor, v.filter, v.gain, v.grit, v.gritGain, v.pan]) node.disconnect()
	}
}

function burst(frequency, amount, duration) {
	if (!context || muted || amount <= 0) return
	const source = noiseSource()
	const filter = context.createBiquadFilter()
	filter.type = 'bandpass'
	filter.frequency.value = frequency
	filter.Q.value = 0.7
	const gain = context.createGain()
	gain.gain.setValueAtTime(amount, context.currentTime)
	gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
	source.connect(filter).connect(gain).connect(master)
	source.start()
	source.stop(context.currentTime + duration)
	source.onended = () => {
		source.disconnect()
		filter.disconnect()
		gain.disconnect()
	}
	note('impact', amount)
}

let squeal
let lastImpact = -Infinity
function engine(car) {
	if (!context) return
	if (playerVoice?.car !== car) {
		stopVoice(playerVoice)
		playerVoice = car ? { ...voice(), car } : null
	}
	if (!squeal && car) {
		const source = noiseSource()
		const filter = context.createBiquadFilter()
		filter.type = 'bandpass'
		filter.frequency.value = 1500
		filter.Q.value = 1.4
		const gain = context.createGain()
		gain.gain.value = 0
		source.connect(filter).connect(gain).connect(master)
		source.start()
		squeal = { source, filter, gain }
	}
	if (squeal) smooth(squeal.gain.gain, car ? Math.min(0.055, Math.max(0, car.slip - 0.5) * 0.018) : 0, 0.04)
	if (!playerVoice) return
	const speed = Math.hypot(car.vx, car.vy)
	const load = Math.abs(car.throttle ?? 0) * (car.braking ? 0.15 : 1)
	const revs = Math.min(1, speed / 9 + load * 0.18)
	smooth(playerVoice.motor.frequency, 27 + revs * 73)
	smooth(playerVoice.filter.frequency, 130 + revs * 650)
	smooth(playerVoice.gritGain.gain, 0.015 + load * 0.09)
	smooth(playerVoice.gain.gain, 0.065 + revs * 0.045)
	if (car.impact > 0.6 && context.currentTime - lastImpact > 0.18) {
		burst(85, Math.min(0.38, car.impact * 0.035), 0.18)
		lastImpact = context.currentTime
	}
	car.impact = 0
}

export const sound = {
	start,
	engine,
	toggleMute() {
		muted = !muted
		if (master) smooth(master.gain, muted ? 0 : 0.22, 0.015)
		try {
			localStorage.setItem('nk-leise', String(muted))
		} catch {
			// A blocked storage write must not interrupt driving.
		}
		return muted
	},
	// Read actual AudioParams for browser verification without an audio device.
	inspect() {
		return {
			state: context?.state ?? 'unstarted',
			muted,
			master: master?.gain.value ?? 0,
			engine: playerVoice && {
				hz: playerVoice.motor.frequency.value,
				gain: playerVoice.gain.gain.value,
				grit: playerVoice.gritGain.gain.value,
			},
			squeal: squeal?.gain.gain.value ?? 0,
			events: [...events],
		}
	},
}

// The jukebox: every song in public/music, to hear, edit and replay as each kind of source
// at any distance, through the same synth and muffling as the street.
import { compile } from './score.js'
import { AHEAD, SCORES, begin, end, feed, shape, synthFor, tune } from '../music.js'

const $ = (id) => document.getElementById(id)
const texts = new Map()
const songs = new Map()
let name = SCORES[0]
let context = null
let synth = null
let playing = null
// When the song started on the audio clock; kept across edits so a change
// replays from where you are.
let since = 0

async function text(n) {
	if (!texts.has(n)) {
		const r = await fetch(`/music/${n}.song`)
		texts.set(n, await r.text())
	}
	return texts.get(n)
}

function listScores() {
	$('scores').replaceChildren(
		...SCORES.map((n) => {
			const button = document.createElement('button')
			const song = songs.get(n)
			button.className = n === name ? 'on' : ''
			const small = document.createElement('small')
			small.textContent = [`${n}.song`, song?.street, song?.about].filter(Boolean).join(' · ')
			button.append(song?.title ?? n, small)
			button.onclick = () => pick(n)
			return button
		}),
	)
}

async function pick(n) {
	name = n
	$('score').value = await text(n)
	if (playing) since = -(context.currentTime + 0.05)
	edited()
}

// Compiles the score in the editor, shows its errors and, if it plays, swaps it in.
function edited() {
	texts.set(name, $('score').value)
	const song = compile($('score').value)
	$('errors').textContent = song.errors.map((e) => `Zeile ${e.line}: ${e.msg}`).join('\n')
	if (song.errors.length) return
	songs.set(name, song)
	listScores()
	if (playing) start(song)
}

function start(song) {
	if (playing) end(playing, context)
	playing = begin(synth, context, { kind: kind().kind, since }, song)
}

function play() {
	const song = songs.get(name)
	if (!song) return
	context ??= new AudioContext()
	synth ??= synthFor(context, context.destination)
	context.resume()
	since = -(context.currentTime + 0.05)
	start(song)
	$('play').textContent = 'Stopp'
}

function stop() {
	end(playing, context)
	playing = null
	$('play').textContent = 'Abspielen'
}

function kind() {
	const value = $('kind').value
	return value === 'own' ? { kind: 'car', own: true } : { kind: value, own: false }
}

function tick() {
	const d = Number($('distance').value)
	const { own } = kind()
	$('distance').disabled = own
	$('metres').textContent = own ? 'drin' : `${Math.round(d * 3)} m`
	if (!playing) return
	const now = context.currentTime
	if (playing.src.kind !== kind().kind) start(playing.song)
	const sound = shape(playing.src.kind, own ? 0 : d, own, $('inCar').checked)
	tune(playing, sound, 0, now)
	feed(playing, now + AHEAD, now)
	const at = now - playing.start
	const { song } = playing
	const where = at < song.intro.dur ? `Intro ${at.toFixed(1)}` : `Loop ${((at - song.intro.dur) % song.loop.dur).toFixed(1)}`
	$('where').textContent = `${where} s · ${Math.round(sound.cutoff)} Hz`
}

$('play').onclick = () => (playing ? stop() : play())
let typing = 0
$('score').oninput = () => {
	clearTimeout(typing)
	typing = setTimeout(edited, 400)
}
for (const n of SCORES)
	text(n).then((t) => {
		if (!songs.has(n)) songs.set(n, compile(t))
		listScores()
	})
pick(name)
setInterval(tick, 50)

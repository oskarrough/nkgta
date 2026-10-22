// The jukebox: every song in public/music, to hear, edit and replay as each kind of source
// at any distance, through the same synth and muffling as the street. The address bar
// always links to what's playing: ?song=sonnenallee&kind=bar&d=6.
import { compile } from './score.js'
import { drawRoll, voiceColors } from './roll.js'
import { AHEAD, SCORES, begin, end, feed, shape, synthFor, tune } from '../music.js'

// What "Neuer Song" opens: short, and it plays as it is.
export const STARTER = `title    Neuer Song
about    What it sounds like, and where.
tempo    100
beats    4
steps    4
reverb   0.3

voice lead  marimba  vol=0.8
voice pad   strings  vol=0.35 center=E4
voice bass  upright  vol=0.8
voice kick  kick     vol=0.7
voice hat   hat      vol=0.35

pattern A
lead | C5- E5- G5- E5- C5- E5- G5- B5- | A4- C5- E5- C5- A4--- G4--- |
pad  | [C]--------------- | [Am]--------------- |
bass | C2--- . C2 G2- C2--- G2--- | A1--- . A1 E2- A1--- E2--- |
kick | x... .... x... .... | % |
hat  | ..x. ..x. ..x. ..x. | % |

loop A
`

const $ = (id) => document.getElementById(id)
const texts = new Map()
const songs = new Map()
// Songs made here, which live only on this page until downloaded.
const made = []
const names = () => SCORES.concat(made)
let name = SCORES[0]
let context = null
let synth = null
let playing = null
// When the song started on the audio clock; kept across edits so a change
// replays from where you are.
let since = 0
// Where the next Abspielen starts, in seconds into the song.
let from = 0
let seeking = false
// Voices switched off, per song, by name.
const muted = new Map()
const mutedIn = (n) => muted.get(n) ?? muted.set(n, new Set()).get(n)

async function text(n) {
	if (!texts.has(n)) {
		const r = await fetch(`/music/${n}.song`)
		texts.set(n, await r.text())
	}
	return texts.get(n)
}

function listScores() {
	$('scores').replaceChildren(
		...names().map((n) => {
			const button = document.createElement('button')
			const song = songs.get(n)
			button.className = n === name ? 'on' : ''
			const small = document.createElement('small')
			small.textContent = [`${n}.song`, song?.street, song?.at?.join(' '), song?.about].filter(Boolean).join(' · ')
			button.append(song?.title ?? n, small)
			button.onclick = () => pick(n)
			return button
		}),
	)
}

// The song, how it plays and from how far, as the page's address.
function remember() {
	const q = new URLSearchParams({ song: name })
	if ($('kind').value !== 'radio') q.set('kind', $('kind').value)
	if ($('distance').value !== '4') q.set('d', $('distance').value)
	if ($('inCar').checked) q.set('car', '1')
	history.replaceState(null, '', `?${q}`)
}

async function pick(n) {
	name = n
	from = 0
	$('score').value = await text(n)
	if (playing) since = -(context.currentTime + 0.05)
	remember()
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
	listVoices(song)
	$('pos').max = length(song)
	$('loopStart').value = song.intro.dur
	if (playing) start(song)
	else showPosition(from)
}

const length = (song) => song.intro.dur + song.loop.dur

// Seconds since the start, folded into the song: past the intro, round the loop.
function folded(song, at) {
	if (at < song.intro.dur || !song.loop.dur) return Math.min(at, length(song))
	return song.intro.dur + ((at - song.intro.dur) % song.loop.dur)
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function showPosition(at) {
	const song = songs.get(name)
	if (!song) return
	if (!seeking) $('pos').value = at
	const part = at < song.intro.dur ? 'Intro' : 'Loop'
	$('time').textContent = `${part} ${clock(at)} / ${clock(length(song))}`
}

function start(song) {
	if (playing) end(playing, context)
	playing = begin(synth, context, { kind: kind().kind, since }, song)
	hush(playing)
}

// Turns the muted voices of what's playing down and the others back up.
function hush(p) {
	const off = mutedIn(name)
	for (const c of p.session.ch) c.input.gain.setTargetAtTime(off.has(c.v.name) ? 0 : c.v.vol * c.def.level, context.currentTime, 0.02)
}

// A button per voice in its colour, to switch it off and on while it plays.
function listVoices(song) {
	const off = mutedIn(name)
	const colors = voiceColors(song)
	$('voices').replaceChildren(
		...song.voices.map((v, i) => {
			const button = document.createElement('button')
			const dot = document.createElement('i')
			const inst = document.createElement('small')
			dot.style.background = colors[i]
			inst.textContent = v.inst
			button.append(dot, v.name, inst)
			button.setAttribute('aria-pressed', String(!off.has(v.name)))
			button.title = off.has(v.name) ? `${v.name} an` : `${v.name} aus`
			button.onclick = () => {
				if (off.has(v.name)) off.delete(v.name)
				else off.add(v.name)
				if (playing) hush(playing)
				listVoices(song)
			}
			return button
		}),
	)
}

function draw() {
	requestAnimationFrame(draw)
	const song = playing?.song ?? songs.get(name)
	if (song) drawRoll($('roll'), song, playing ? context.currentTime - playing.start : from, mutedIn(name))
}

function play() {
	const song = songs.get(name)
	if (!song) return
	context ??= new AudioContext()
	synth ??= synthFor(context, context.destination)
	context.resume()
	since = from - (context.currentTime + 0.05)
	start(song)
	$('play').textContent = 'Stopp'
}

function stop() {
	from = folded(playing.song, context.currentTime - playing.start)
	end(playing, context)
	playing = null
	$('play').textContent = 'Abspielen'
}

// Jumps to `at` seconds into the song, playing or not.
function seek(at) {
	from = at
	showPosition(at)
	if (!playing) return
	since = at - (context.currentTime + 0.05)
	start(playing.song)
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
	// A browser that wouldn't start sound by itself gets one big button to click.
	$('unblock').hidden = !(playing && context.state !== 'running')
	if (!playing) return
	const now = context.currentTime
	if (playing.src.kind !== kind().kind) start(playing.song)
	const sound = shape(playing.src.kind, own ? 0 : d, own, $('inCar').checked)
	tune(playing, sound, 0, now)
	feed(playing, now + AHEAD, now)
	showPosition(folded(playing.song, Math.max(0, now - playing.start)))
	$('where').textContent = `${Math.round(sound.cutoff)} Hz`
}

function download() {
	const a = document.createElement('a')
	a.href = URL.createObjectURL(new Blob([$('score').value], { type: 'text/plain' }))
	a.download = `${name}.song`
	a.click()
	setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function create() {
	let n = 'neu'
	for (let i = 2; names().includes(n); i++) n = `neu-${i}`
	made.push(n)
	texts.set(n, STARTER)
	pick(n).then(() => playing || play())
}

$('play').onclick = () => (playing ? stop() : play())
$('unblock').onclick = () => context.resume()
$('new').onclick = create
$('download').onclick = download
$('pos').onpointerdown = () => (seeking = true)
$('pos').oninput = () => showPosition(Number($('pos').value))
$('pos').onchange = () => {
	seeking = false
	seek(Number($('pos').value))
}
for (const id of ['kind', 'distance', 'inCar']) $(id).addEventListener('change', remember)
let typing = 0
$('score').oninput = () => {
	clearTimeout(typing)
	typing = setTimeout(edited, 400)
}

// The address says what to play: ?song=konvoi&kind=convoy&d=20&car=1.
const asked = new URLSearchParams(location.search)
if ([...$('kind').options].some((o) => o.value === asked.get('kind'))) $('kind').value = asked.get('kind')
if (asked.has('d')) $('distance').value = asked.get('d')
$('inCar').checked = asked.get('car') === '1'
const wanted = SCORES.includes(asked.get('song')) ? asked.get('song') : null
for (const n of SCORES)
	text(n).then((t) => {
		if (!songs.has(n)) songs.set(n, compile(t))
		listScores()
	})
pick(wanted ?? name).then(() => wanted && play())
setInterval(tick, 50)
requestAnimationFrame(draw)

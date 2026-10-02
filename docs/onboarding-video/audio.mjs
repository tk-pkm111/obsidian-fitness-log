// Original score + sound design, synthesized from scratch (no samples), synced to cues.js.
// node audio.mjs → reel.wav (48 kHz, 16-bit stereo)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
new Function(readFileSync(path.join(here, 'cues.js'), 'utf8'))();
const C = globalThis.CUES;

const SR = 48000;
const DUR = C.duration;
const N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const revL = new Float32Array(N), revR = new Float32Array(N); // reverb send
const kickBus = new Float32Array(N); // kick is not ducked by its own sidechain
const duck = new Float32Array(N).fill(1); // sidechain gain (kick)
const BEAT = 60 / C.bpm, BAR = BEAT * 4;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 1234567;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function put(i, l, r, send = 0) {
	if (i < 0 || i >= N) return;
	L[i] += l; R[i] += r;
	if (send) { revL[i] += l * send; revR[i] += r * send; }
}
const panLR = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

/* ---------------- instruments ---------------- */
// warm pad voice: band-limited saw (6 harmonics), detuned pair, one-pole lowpass, slow envelope
function pad(t0, dur, midi, gain, pan = 0, cutoff = 1400, att = 0.5, rel = 1.2) {
	const f = mtof(midi), [pl, pr] = panLR(pan);
	const n0 = Math.floor(t0 * SR), n = Math.floor((dur + rel) * SR);
	let lp = 0; const a = 1 - Math.exp((-TAU * cutoff) / SR);
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		let s = 0;
		for (const det of [-0.0045, 0.0045]) {
			const ff = f * (1 + det);
			for (let hN = 1; hN <= 6; hN++) s += Math.sin(TAU * ff * hN * t + hN * 0.3) / hN;
		}
		lp += a * (s - lp);
		const e = Math.min(1, t / att) * (t > dur ? Math.exp(-(t - dur) / (rel * 0.35)) : 1);
		const v = lp * e * gain * 0.085;
		put(n0 + k, v * pl, v * pr, 0.55);
	}
}
// pluck: sine + soft harmonics, exponential decay
function pluck(t0, midi, gain, pan = 0, decay = 0.35, send = 0.45) {
	const f = mtof(midi), [pl, pr] = panLR(pan);
	const n0 = Math.floor(t0 * SR), n = Math.floor(decay * 6 * SR);
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		const e = Math.min(1, t / 0.003) * Math.exp(-t / decay);
		const s = Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * f * 2 * t) * Math.exp(-t / (decay * 0.4)) + 0.12 * Math.sin(TAU * f * 3 * t) * Math.exp(-t / (decay * 0.2));
		const v = s * e * gain;
		put(n0 + k, v * pl, v * pr, send);
	}
}
// bell (inharmonic partials) for chimes / sparkles
function bell(t0, midi, gain, pan = 0, decay = 0.9) {
	const f = mtof(midi), [pl, pr] = panLR(pan);
	const parts = [[1, 1], [2.01, 0.45], [2.76, 0.25], [5.4, 0.12]];
	const n0 = Math.floor(t0 * SR), n = Math.floor(decay * 5 * SR);
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		let s = 0;
		for (const [m, g] of parts) s += g * Math.sin(TAU * f * m * t) * Math.exp(-t / (decay / m));
		const v = s * gain * Math.min(1, t / 0.002);
		put(n0 + k, v * pl, v * pr, 0.6);
	}
}
function kick(t0, gain = 1) {
	const n0 = Math.floor(t0 * SR), n = Math.floor(0.55 * SR);
	let ph = 0;
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		const f = 46 + 110 * Math.exp(-t / 0.045);
		ph += (TAU * f) / SR;
		const e = Math.exp(-t / 0.28);
		const click = Math.exp(-t / 0.002) * 0.4 * rnd();
		const v = (Math.sin(ph) * e + click) * gain * 0.8;
		if (n0 + k < N) kickBus[n0 + k] += v;
		// sidechain: duck everything else on the beat
		const i = n0 + k;
		if (i < N) duck[i] = Math.min(duck[i], 1 - 0.55 * Math.exp(-t / 0.12));
	}
}
function hat(t0, gain = 0.25, decay = 0.035, pan = 0.25) {
	const [pl, pr] = panLR(pan);
	const n0 = Math.floor(t0 * SR), n = Math.floor(decay * 8 * SR);
	let hp = 0, prev = 0;
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		const x = rnd();
		hp = 0.92 * (hp + x - prev); prev = x; // one-pole highpass
		const v = hp * Math.exp(-t / decay) * gain;
		put(n0 + k, v * pl, v * pr, 0.08);
	}
}
function clap(t0, gain = 0.5) {
	const n0 = Math.floor(t0 * SR), n = Math.floor(0.4 * SR);
	let bp1 = 0, bp2 = 0;
	const f = 1400, q = 0.9, w = (TAU * f) / SR, a = Math.sin(w) / (2 * q);
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		const bursts = [0, 0.011, 0.022].reduce((acc, d) => acc + (t >= d ? Math.exp(-(t - d) / (d === 0.022 ? 0.11 : 0.008)) : 0), 0);
		const x = rnd() * bursts;
		// crude state-variable bandpass
		bp1 += a * (x - bp1 - bp2 * 0.4); bp2 += a * bp1;
		const v = bp1 * gain * 2.2;
		put(n0 + k, v * 0.9, v, 0.35);
	}
}
function sub(t0, dur, midi, gain = 0.5) {
	const f = mtof(midi);
	const n0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		const e = Math.min(1, t / 0.01) * Math.min(1, (dur - t) / 0.05);
		const s = Math.sin(TAU * f * t) + 0.18 * Math.sin(TAU * f * 2 * t);
		const v = Math.tanh(s * 1.3) * e * gain;
		put(n0 + k, v, v);
	}
}
// filtered noise sweep (riser / whoosh)
function sweep(t0, dur, f0, f1, gain, shape = 'swell', pan = 0) {
	const n0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
	let low = 0, band = 0;
	for (let k = 0; k < n; k++) {
		const p = k / n;
		const f = f0 * Math.pow(f1 / f0, p);
		const fc = 2 * Math.sin((Math.PI * Math.min(f, SR / 4)) / SR);
		const x = rnd();
		low += fc * band; const high = x - low - 0.6 * band; band += fc * high;
		const e = shape === 'swell' ? Math.pow(p, 2.2) : Math.sin(Math.PI * p) ** 1.5;
		const v = band * e * gain;
		const pp = shape === 'whoosh' ? pan * (p * 2 - 1) : 0;
		const [pl, pr] = panLR(pp);
		put(n0 + k, v * pl, v * pr, 0.4);
	}
}
function impact(t0, gain = 0.8) {
	sub(t0, 0.7, 31, gain * 0.28);
	const n0 = Math.floor(t0 * SR), n = Math.floor(1.6 * SR);
	let lp = 0;
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		lp += 0.08 * (rnd() - lp);
		const v = lp * Math.exp(-t / 0.45) * gain * 1.4;
		put(n0 + k, v, v, 0.9);
	}
}
// UI sounds
function tick(t0, f = 3200, gain = 0.12, decay = 0.012, pan = 0) {
	const [pl, pr] = panLR(pan);
	const n0 = Math.floor(t0 * SR), n = Math.floor(decay * 6 * SR);
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		const v = (Math.sin(TAU * f * t) * 0.7 + rnd() * 0.3 * Math.exp(-t / 0.002)) * Math.exp(-t / decay) * gain;
		put(n0 + k, v * pl, v * pr, 0.15);
	}
}
function tap(t0, gain = 0.3) {
	// soft bubble: quick upward chirp
	const n0 = Math.floor(t0 * SR), n = Math.floor(0.09 * SR);
	let ph = 0;
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		ph += (TAU * (700 + 900 * (t / 0.09))) / SR;
		const v = Math.sin(ph) * Math.exp(-t / 0.03) * gain;
		put(n0 + k, v, v, 0.25);
	}
	tick(t0, 2600, gain * 0.35, 0.006);
}
function press(t0, gain = 0.35) {
	tick(t0, 1800, gain * 0.4, 0.008);
	const n0 = Math.floor(t0 * SR), n = Math.floor(0.12 * SR);
	for (let k = 0; k < n; k++) {
		const t = k / SR;
		const v = Math.sin(TAU * 520 * t) * Math.exp(-t / 0.04) * gain;
		put(n0 + k, v, v, 0.2);
	}
}

/* ---------------- arrangement ---------------- */
const CH = {
	Dm9: [50, 53, 57, 60, 64], Bbmaj9: [46, 50, 53, 57, 60], Fmaj9: [53, 57, 60, 64, 67], C69: [48, 52, 55, 57, 62],
};
const ROOT = { Dm9: 38, Bbmaj9: 34, Fmaj9: 41, C69: 36 };
const PROG = ['Dm9', 'Bbmaj9', 'Fmaj9', 'C69'];
const bars = Math.ceil(DUR / BAR);
const chordAt = (b) => PROG[b % 4];
const inRange = (t, a, b) => t >= a - 1e-6 && t < b - 1e-6;

// pads: whole piece, brighter in the peak
for (let b = 0; b < bars - 2; b++) {
	const t0 = b * BAR, name = chordAt(b);
	const cutoff = inRange(t0, C.ch4.start, C.ch4.end) ? 2400 : inRange(t0, C.ch3.start, C.ch3.end) ? 1100 : 1600;
	CH[name].forEach((m, i) => pad(t0, BAR, m, i === 0 ? 0.9 : 0.75, (i / 4) * 1.2 - 0.6, cutoff, b === 0 ? 1.4 : 0.35, 0.9));
}
// final chord (outro)
const FINAL = [41, 48, 52, 55, 57, 60, 64];
FINAL.forEach((m, i) => pad(C.outro.start, 4.2, m, 0.85, (i / 6) * 1.4 - 0.7, 2000, 0.25, 2.2));
sub(C.outro.start, 3.5, 29, 0.2);

// drums & bass
for (let b = 0; b < bars; b++) {
	for (let q = 0; q < 4; q++) {
		const t = b * BAR + q * BEAT;
		const kickOn = (inRange(t, C.ch1.start, C.ch3.start) || inRange(t, C.ch3.start + BAR, C.ch4.end)) && !inRange(t, C.ch3.end - BEAT, C.ch3.end);
		if (kickOn) kick(t, inRange(t, C.ch4.start, C.ch4.end) ? 1 : 0.85);
		const clapOn = (inRange(t, C.ch2.start, C.ch3.start) || inRange(t, C.ch4.start, C.ch4.end)) && (q === 1 || q === 3);
		if (clapOn) clap(t, 0.42);
		// hats: offbeat 8ths from ch1 bar 2; 16ths in the peak
		if (inRange(t, C.ch1.start + BAR, C.ch4.end)) {
			hat(t + BEAT / 2, 0.2, 0.04, 0.3);
			if (inRange(t, C.ch4.start, C.ch4.end)) { hat(t + BEAT / 4, 0.08, 0.02, -0.3); hat(t + (3 * BEAT) / 4, 0.08, 0.02, -0.3); }
		}
		// bass: offbeat 8ths on the root
		if (inRange(t, C.ch1.start, C.ch4.end) && !inRange(t, C.ch3.start, C.ch3.start + BAR)) {
			const root = ROOT[chordAt(b)];
			sub(t + BEAT / 2, BEAT / 2 - 0.02, root, 0.22);
			if (inRange(t, C.ch4.start, C.ch4.end) && q % 2 === 1) sub(t + BEAT * 0.75, BEAT / 4 - 0.02, root + 12, 0.12);
		}
	}
}
// snare-ish build into ch4 (16ths roll with clap)
for (let i = 0; i < 8; i++) clap(C.ch4.start - BEAT * 2 + i * (BEAT / 4), 0.12 + i * 0.03);

// arps (pluck): 8ths in ch2, 16ths in ch4, sparse in ch3
const arpOrder = [0, 2, 4, 3, 1, 3, 2, 4];
for (let b = 0; b < bars; b++) {
	const t0 = b * BAR, notes = CH[chordAt(b)].map((m) => m + 12);
	if (inRange(t0, C.ch2.start + BAR * 2, C.ch3.start)) for (let i = 0; i < 8; i++) pluck(t0 + i * (BEAT / 2), notes[arpOrder[i]], 0.075, i % 2 ? 0.45 : -0.45, 0.22);
	if (inRange(t0, C.ch3.start, C.ch3.end)) for (let i = 0; i < 4; i++) pluck(t0 + i * BEAT + BEAT / 2, notes[arpOrder[i]], 0.06, i % 2 ? 0.5 : -0.5, 0.5, 0.7);
	if (inRange(t0, C.ch4.start, C.ch4.end)) for (let i = 0; i < 16; i++) pluck(t0 + i * (BEAT / 4), notes[arpOrder[i % 8]] + (i >= 8 ? 12 : 0), 0.05, i % 2 ? 0.55 : -0.55, 0.14);
}

/* ---------------- sound design synced to cues ---------------- */
const I = C.intro, A = C.ch1, B = C.ch2, D = C.ch3, F = C.ch4, O = C.outro;
// intro: dot, bar stretch, plates, wordmark, tagline
sub(I.dot, 0.5, 33, 0.16); bell(I.dot, 81, 0.12, 0, 0.6);
sweep(I.bar - 0.05, 0.5, 400, 3000, 0.25, 'whoosh', 0.6);
pluck(I.plates, 74, 0.16, -0.3, 0.4); pluck(I.plates + 0.12, 81, 0.12, 0.3, 0.4);
[...'Fitness Log'].forEach((ch, i) => ch !== ' ' && tick(I.word + i * 0.035 + 0.08, 4200 + i * 120, 0.05, 0.01, (i / 10) * 1.2 - 0.6));
pluck(I.word, 69, 0.14, 0, 0.6); pluck(I.tag, 72, 0.12, -0.2, 0.6); pluck(I.tag + 0.25, 76, 0.1, 0.2, 0.6);
// transitions: riser into each chapter + whoosh on the wipe + impact on the downbeat
for (const [at, big] of [[A.start, true], [B.start, false], [D.start, false], [F.start, true], [O.start, true]]) {
	sweep(at - (big ? 1.8 : 1.0), big ? 1.8 : 1.0, 300, 6000, big ? 0.35 : 0.22, 'swell');
	sweep(at - 0.32, 0.64, 600, 4000, 0.45, 'whoosh', 0.9);
	impact(at, big ? 0.7 : 0.45);
}
// ch1: cursor click, typing, button press, tree reveal, note pills, packages
tap(A.clickInput, 0.22); tick(A.clickInput, 2400, 0.1, 0.01);
for (let i = 0; i < C.typed.length; i++) tick(A.typeStart + ((i + 1) * (A.typeEnd - A.typeStart)) / C.typed.length, 2900 + (i % 3) * 300, 0.09, 0.014, 0.1);
press(A.press, 0.45);
sweep(A.collapse, 0.45, 2000, 300, 0.18, 'whoosh', -0.5);
pluck(A.tree, 74, 0.13, 0, 0.5);
pluck(A.branches + 0.4, 77, 0.11, -0.4, 0.45); pluck(A.branches + 0.5, 81, 0.11, 0.4, 0.45);
const PENTA = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
for (let i = 0; i < 12; i++) pluck(A.notes + (i / 12) * (A.notesEnd - A.notes) * 0.85, PENTA[i], 0.045, (i % 2 ? 1 : -1) * 0.5, 0.18, 0.5);
for (let i = 0; i < 6; i++) tick(A.packages + i * 0.07 + 0.05, 1800 + i * 200, 0.07, 0.02, (i / 5) * 1.2 - 0.6);
// ch2: tap play, timer, stop, sheet, wheel detents, record, success, rest
tap(B.tapPlay, 0.32); bell(B.tapPlay + 0.02, 88, 0.05, 0, 0.3);
for (let s = 1; s <= 38; s++) { const t = B.tapPlay + (s / 38) * (B.timerEnd - B.tapPlay); tick(t, 1500, 0.025, 0.006, 0.4); }
tap(B.tapStop, 0.32);
sweep(B.sheetIn - 0.05, 0.4, 500, 2500, 0.16, 'whoosh', 0.3);
{ let prev = Math.floor(C.wheelValue(B.wheelStart)); for (let t = B.wheelStart; t <= B.wheelEnd + 0.1; t += 0.001) { const v = Math.floor(C.wheelValue(t) + 0.5); if (v !== prev) { tick(t, 3800, 0.11, 0.008, 0.15); prev = v; } } }
tap(B.tapRecord, 0.34);
sweep(B.sheetOut, 0.35, 2500, 500, 0.12, 'whoosh', -0.3);
bell(B.rowIn, 76, 0.13, -0.15, 0.7); bell(B.rowIn + 0.11, 81, 0.13, 0.15, 0.9);
pluck(B.rest, 69, 0.06, 0, 0.6);
// ch3: lines appear, card fly, land
for (let i = 0; i < 8; i++) tick(D.lines + (i / 8) * (D.linesEnd - D.lines), 2200 + i * 90, 0.04, 0.012, (i % 2 ? 0.3 : -0.3));
pluck(D.card, 76, 0.1, -0.5, 0.4);
sweep(D.fly, D.land - D.fly, 800, 5000, 0.2, 'whoosh', 0.8);
bell(D.land, 79, 0.14, 0.2, 1.0); bell(D.land + 0.09, 84, 0.1, 0.2, 1.0);
// ch4: bars grow (ascending), rows, best sparkle, zoom whoosh, points, tooltip
for (let i = 0; i < 12; i++) pluck(F.bars + i * 0.06 + 0.05, PENTA[Math.min(11, i)] - 12, 0.05, (i / 11) * 1.2 - 0.6, 0.16, 0.4);
for (let i = 0; i < 3; i++) tick(F.rows + i * 0.18, 2000, 0.06, 0.015);
[84, 88, 91, 96].forEach((m, i) => bell(F.best + i * 0.07, m, 0.07, (i - 1.5) * 0.4, 0.7));
sweep(F.zoom - 0.1, 0.7, 300, 3000, 0.28, 'whoosh', 0);
for (let i = 0; i < 14; i++) tick(F.line + (i / 13) * (F.compare - F.line), 2600 + i * 60, 0.035, 0.01, (i / 13) * 1.4 - 0.7);
pluck(F.tip, 81, 0.1, 0.3, 0.5);
// outro: logo assembles, word, tag, button chime
bell(O.logo, 81, 0.12, 0, 1.2);
pluck(O.logo + 0.85, 74, 0.13, -0.3, 0.5); pluck(O.logo + 0.97, 81, 0.11, 0.3, 0.5);
[...'Fitness Log'].forEach((ch, i) => ch !== ' ' && tick(O.word + i * 0.035 + 0.08, 4200 + i * 120, 0.04, 0.01, (i / 10) * 1.2 - 0.6));
pluck(O.tag, 72, 0.1, -0.2, 0.7); pluck(O.tag + 0.25, 76, 0.09, 0.2, 0.7);
press(O.button, 0.3); [77, 81, 84, 89].forEach((m, i) => bell(O.button + 0.05 + i * 0.09, m, 0.08, (i - 1.5) * 0.3, 1.2));

/* ---------------- reverb (Schroeder: 4 combs + 2 allpasses per side) ---------------- */
function reverb(input, delaysMs, seedOffset) {
	const out = new Float32Array(N);
	const combs = delaysMs.map((ms) => ({ buf: new Float32Array(Math.floor((ms * SR) / 1000)), i: 0, lp: 0 }));
	for (let n = 0; n < N; n++) {
		let s = 0;
		for (const c of combs) {
			const y = c.buf[c.i];
			c.lp = y * 0.75 + c.lp * 0.25;
			c.buf[c.i] = input[n] + c.lp * 0.82;
			c.i = (c.i + 1) % c.buf.length;
			s += y;
		}
		out[n] = s * 0.25;
	}
	for (const ms of [5.0 + seedOffset, 1.7 + seedOffset * 0.3]) {
		const buf = new Float32Array(Math.floor((ms * SR) / 1000)); let i = 0;
		for (let n = 0; n < N; n++) { const bv = buf[i]; const x = out[n]; const y = -x * 0.6 + bv; buf[i] = x + bv * 0.6; i = (i + 1) % buf.length; out[n] = y; }
	}
	return out;
}
const wetL = reverb(revL, [29.7, 37.1, 41.1, 43.7], 0);
const wetR = reverb(revR, [30.7, 36.3, 40.3, 45.1], 0.4);

/* ---------------- master ---------------- */
// fade in/out with the picture
const fadeIn = (t) => Math.min(1, t / 0.4);
const fadeOut = (t) => (t < O.fade ? 1 : Math.max(0, 1 - (t - O.fade) / (DUR - O.fade)));
let peak = 0;
const outL = new Float32Array(N), outR = new Float32Array(N);
for (let n = 0; n < N; n++) {
	const t = n / SR;
	const g = fadeIn(t) * Math.pow(fadeOut(t), 1.4);
	// sidechain the music (not the kick itself — kick is already summed; acceptable glue)
	let l = (L[n] * duck[n] + kickBus[n] + wetL[n] * 0.32) * g;
	let r = (R[n] * duck[n] + kickBus[n] + wetR[n] * 0.32) * g;
	l = Math.tanh(l * 1.15) / 1.15; r = Math.tanh(r * 1.15) / 1.15;
	outL[n] = l; outR[n] = r;
	peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const norm = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
	buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[n] * norm)) * 32767), 44 + n * 4);
	buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[n] * norm)) * 32767), 46 + n * 4);
}
writeFileSync(path.join(here, 'reel.wav'), buf);
console.log('reel.wav', DUR + 's', 'peak before norm', peak.toFixed(3));

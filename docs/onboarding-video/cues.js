/* Shared timeline (seconds). Read by index.html (visuals) and audio.mjs (score + SFX). 120 BPM: beat = 0.5s */
(function (root) {
	const C = {
		fps: 60,
		duration: 42,
		bpm: 120,
		// bars are 2s; chapters start on bar lines, taps land on beats
		intro: { dot: 0.5, bar: 1.0, plates: 1.5, word: 2.0, tag: 2.5, out: 3.35, end: 4.0 },
		ch1: {
			start: 4.0, title: 4.15, modal: 4.5, cursorIn: 5.4, clickInput: 6.0,
			typeStart: 6.25, typeEnd: 7.0, cursorToBtn: 7.25, press: 8.0,
			collapse: 8.15, tree: 8.5, branches: 8.75, notes: 9.25, notesEnd: 10.75,
			packages: 10.5, out: 11.35, end: 12.0,
		},
		ch2: {
			start: 12.0, title: 12.15, phone: 12.3, tapPlay: 13.5, timerEnd: 15.4,
			tapStop: 15.5, sheetIn: 15.65, wheelStart: 16.0, wheelEnd: 17.0,
			tapRecord: 17.5, sheetOut: 17.6, rowIn: 17.85, rest: 18.25, restEnd: 20.5,
			out: 21.35, end: 22.0,
		},
		ch3: {
			start: 22.0, title: 22.15, editor: 22.35, lines: 22.75, linesEnd: 24.9,
			card: 25.0, fly: 25.5, land: 26.0, out: 27.35, end: 28.0,
		},
		ch4: {
			start: 28.0, title: 28.15, panel: 28.35, bars: 28.9, rows: 29.5,
			best: 31.0, zoom: 32.0, line: 32.5, compare: 33.6, tip: 34.5,
			out: 35.35, end: 36.0,
		},
		outro: { start: 36.0, logo: 36.0, word: 37.0, tag: 37.5, button: 38.0, shine: 38.5, fade: 40.4 },
		typed: 'Fitness',
		wheel: { from: 6, to: 10 },
	};
	/** easeOutBack: overshoots then settles (wheel flick) */
	C.wheelValue = function (t) {
		const w = C.ch2;
		const p = Math.min(1, Math.max(0, (t - w.wheelStart) / (w.wheelEnd - w.wheelStart)));
		const s = 1.25;
		const e = 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
		return C.wheel.from + (C.wheel.to - C.wheel.from) * e;
	};
	root.CUES = C;
})(typeof window !== 'undefined' ? window : globalThis);

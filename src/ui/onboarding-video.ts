import { setIcon } from 'obsidian';
import { t } from '../i18n';

/**
 * 使い方の動画（42 秒）。元は docs/onboarding-video/onboarding.mp4。
 * - 通信は再生を押したときだけ。それまでは何も読み込まない（README に明記）
 * - GitHub の raw は動画を種類不明（application/octet-stream）で返し iPhone で再生できないことがあるので、
 *   正しい種類（video/mp4）で返す jsDelivr から読む。コミットで固定しているので、動画を作り直したら差し替える
 */
const VIDEO_URL =
	'https://cdn.jsdelivr.net/gh/tk-pkm111/obsidian-fitness-log@6ef1fdc2d2cf607a953a8fde92389ad8998acaa6/docs/onboarding-video/onboarding.mp4';

/** 表紙（押すと動画に替わる）と、通信の注意書き */
export function renderOnboardingVideo(parent: HTMLElement): void {
	const box = parent.createDiv({ cls: 'fitness-log-video' });
	box.createDiv({ cls: 'fitness-log-setup-label', text: t('setup.video') });
	const frame = box.createDiv({ cls: 'fitness-log-video-frame' });
	const note = box.createDiv({ cls: 'fitness-log-muted' });

	const showPoster = (failed: boolean) => {
		frame.empty();
		note.setText(failed ? t('setup.videoError') : t('setup.videoNote'));
		note.toggleClass('fitness-log-video-error', failed);
		const poster = frame.createEl('button', {
			cls: 'fitness-log-video-poster',
			attr: { type: 'button' },
		});
		setIcon(
			poster.createDiv({ cls: 'fitness-log-video-mark' }),
			'dumbbell',
		);
		poster.createDiv({
			cls: 'fitness-log-video-name',
			text: 'Fitness Log',
		});
		const pill = poster.createDiv({ cls: 'fitness-log-video-play' });
		setIcon(pill.createSpan(), 'play');
		pill.createSpan({ text: t('setup.videoPlay') });
		poster.addEventListener('click', showVideo);
	};

	const showVideo = () => {
		frame.empty();
		note.setText(t('setup.videoNote'));
		note.removeClass('fitness-log-video-error');
		const video = frame.createEl('video');
		video.controls = true;
		video.playsInline = true;
		video.addEventListener('error', () => showPoster(true));
		video.src = VIDEO_URL;
		// 自動再生が拒まれても、コントロールから再生できる
		video.play().catch(() => {});
	};

	showPoster(false);
}

#!/bin/zsh
# 書き出し: 音楽（audio.mjs）→ 映像を 6 分割で並列に書き出し → つなぐ → 音を重ねる → 配信用に縮める
#   master.mp4      1920×1080・60fps（手元用。git には入れない）
#   onboarding.mp4  1280×720・60fps（プラグインの「はじめの設定」で再生する。git に入れる）
set -e
cd "$(dirname "$0")"
node audio.mjs
rm -f chunk-*.mp4
pids=()
for i in 0 1 2 3 4 5; do
  from=$((i*7)); to=$((from+7))
  node render.mjs video chunk-$i.mp4 60 $from $to > chunk-$i.log 2>&1 &
  pids+=($!)
done
for p in $pids; do wait $p; done
printf "file 'chunk-%d.mp4'\n" 0 1 2 3 4 5 > chunks.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i chunks.txt -c copy video-only.mp4
ffmpeg -y -loglevel error -i video-only.mp4 -i reel.wav -map 0:v -map 1:a -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 256k -movflags +faststart -shortest master.mp4
ffmpeg -y -loglevel error -i reel.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 192k reel.m4a
ffmpeg -y -loglevel error -i master.mp4 -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 25 -profile:v high -level 4.1 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart onboarding.mp4
rm -f chunk-* chunks.txt video-only.mp4
ls -la master.mp4 onboarding.mp4

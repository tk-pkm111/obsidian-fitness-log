#!/bin/zsh
# usage: sheet.sh out.png t1 t2 ... (up to 9) → 3x3 contact sheet of stills/t-*.png (each 640x360)
out=$1; shift
args=(); filt=""; i=0
for t in "$@"; do f=$(printf "stills/t-%.2f.png" $t); args+=(-i $f); filt+="[$i:v]scale=640:360[v$i];"; i=$((i+1)); done
while [ $i -lt 9 ]; do args+=(-f lavfi -i color=c=black:s=640x360); filt+="[$i:v]null[v$i];"; i=$((i+1)); done
filt+="[v0][v1][v2][v3][v4][v5][v6][v7][v8]xstack=inputs=9:layout=0_0|w0_0|w0+w1_0|0_h0|w0_h0|w0+w1_h0|0_h0+h3|w0_h0+h3|w0+w1_h0+h3[out]"
ffmpeg -y -loglevel error "${args[@]}" -filter_complex "$filt" -map "[out]" -frames:v 1 $out

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const mediaPath = process.argv[2];
const outPath = process.argv[3] || '/tmp/hermes-audio-proof.json';
if (!mediaPath) {
  console.error('usage: analyze-audio-proof.cjs <media-file> [out-json]');
  process.exit(2);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function ffprobeStream(path) {
  try {
    const raw = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels,codec_name,sample_rate', '-of', 'json', path]);
    const data = JSON.parse(raw);
    return data.streams?.[0] || null;
  } catch (_) {
    return null;
  }
}

function decodeWindow(path, start, duration) {
  const res = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(start), '-t', String(duration), '-i', path, '-map', '0:a:0', '-ac', '2', '-ar', '48000', '-f', 'f32le', '-'], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) return null;
  const buf = res.stdout;
  const samples = Math.floor(buf.length / 4);
  if (samples < 4) return null;
  let left = 0, right = 0, peak = 0, frames = 0;
  for (let i = 0; i + 1 < samples; i += 2) {
    const l = buf.readFloatLE(i * 4);
    const r = buf.readFloatLE((i + 1) * 4);
    left += l * l;
    right += r * r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    frames += 1;
  }
  const leftRms = Math.sqrt(left / Math.max(1, frames));
  const rightRms = Math.sqrt(right / Math.max(1, frames));
  const mean = Math.sqrt((left + right) / Math.max(1, frames * 2));
  return {
    start,
    end: start + duration,
    left_rms: Number(leftRms.toFixed(6)),
    right_rms: Number(rightRms.toFixed(6)),
    mean_rms: Number(mean.toFixed(6)),
    peak: Number(peak.toFixed(6)),
    dbfs_mean: mean > 0 ? Number((20 * Math.log10(mean)).toFixed(1)) : null,
    separation: Number((leftRms - rightRms).toFixed(6)),
  };
}

const stream = ffprobeStream(mediaPath);
const windows = {
  left: decodeWindow(mediaPath, 1.8, 1.2),
  right: decodeWindow(mediaPath, 4.5, 1.2),
  center: decodeWindow(mediaPath, 7.5, 1.2),
  tts: decodeWindow(mediaPath, 11.4, 5.8),
};
const all = decodeWindow(mediaPath, 0, 18);
const summary = {
  audio_capture: {
    has_audio_stream: Boolean(stream),
    stream,
    mean_volume_db: all?.dbfs_mean ?? null,
    max_peak: all?.peak ?? null,
    speech_windows: windows.tts ? [{ start: windows.tts.start, end: windows.tts.end, rms_peak: windows.tts.peak, mean_rms: windows.tts.mean_rms, dbfs_mean: windows.tts.dbfs_mean }] : [],
    pan_windows: {
      left: windows.left,
      right: windows.right,
      center: windows.center,
    },
    assertions: {
      left_separation: Boolean(windows.left && windows.left.left_rms > windows.left.right_rms * 1.25 && windows.left.left_rms > 0.0005),
      right_separation: Boolean(windows.right && windows.right.right_rms > windows.right.left_rms * 1.25 && windows.right.right_rms > 0.0005),
      center_balanced: Boolean(windows.center && Math.abs(windows.center.left_rms - windows.center.right_rms) < Math.max(0.004, windows.center.mean_rms * 0.35)),
      tts_audible: Boolean(windows.tts && windows.tts.mean_rms > 0.002),
    },
  },
};
fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

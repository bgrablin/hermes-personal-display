import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

function api() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(new URL('../src/mascot/activity-trace.js', import.meta.url), 'utf8'), context);
  return context.window.HermesActivityTrace;
}

describe('observed activity trace', () => {
  it('coalesces repeated polls and bounds history without retaining payload text', () => {
    let now = 0;
    const trace = api().createTrace({ clock: () => now });
    trace.observe('reading');
    now = 65000;
    trace.observe('reading', { caption: 'DO NOT RETAIN', session: 'DO NOT RETAIN' });
    expect(trace.snapshot().elapsed).toBe('1m 5s');
    expect(trace.snapshot().entries).toHaveLength(1);
    for (const mode of ['reasoning', 'tool_shell', 'reading', 'writing', 'complete']) trace.observe(mode);
    expect(trace.snapshot().entries.map((entry) => entry.mode)).toEqual(['reasoning', 'tool_shell', 'reading', 'writing', 'complete']);
    expect(JSON.stringify(trace.snapshot())).not.toContain('DO NOT RETAIN');
  });

  it('does not invent idle or continued activity before connection or across a feed gap', () => {
    let now = 0;
    const trace = api().createTrace({ clock: () => now });
    trace.observe('idle_watch', { connected: false });
    expect(trace.snapshot()).toMatchObject({ status: 'connecting', elapsed: null, entries: [] });
    trace.observe('reasoning');
    now = 2000;
    trace.observe('reasoning', { freshness: 'lost' });
    now = 60000;
    expect(trace.snapshot()).toMatchObject({ status: 'stale', elapsed: null });
    expect(trace.snapshot().entries).toHaveLength(1);
    trace.observe('reasoning');
    expect(trace.snapshot().elapsed).toBe('0s');
  });

  it('clears history at the privacy boundary and labels simulated data', () => {
    const trace = api().createTrace({ clock: () => 0 });
    trace.observe('reading', { preview: true, connected: false });
    expect(trace.snapshot().status).toBe('preview');
    trace.observe('reading', { privateMode: true });
    expect(trace.snapshot()).toMatchObject({ status: 'private', elapsed: null, entries: [] });
    trace.observe('idle_watch');
    expect(trace.snapshot().entries.map((entry) => entry.mode)).toEqual(['idle_watch']);
  });

  it('rejects unrecognized phases and tolerates invalid/backward clocks', () => {
    let now = 2000;
    const trace = api().createTrace({ clock: () => now });
    trace.observe('reasoning');
    now = -4000;
    expect(trace.snapshot().elapsed).toBe('0s');
    now = NaN;
    expect(trace.snapshot().elapsed).toBe('0s');
    for (const mode of ['raw prompt', '__proto__', 'toString']) trace.observe(mode);
    expect(trace.snapshot().entries).toHaveLength(1);
    expect(trace.snapshot().elapsed).toBeNull();
  });

  it('gives waiting direct eye contact and working a purposeful target', () => {
    const { presenceForMode } = api();
    expect(presenceForMode('waiting_user')).toEqual({ kind: 'waiting', holdMs: 0 });
    expect(presenceForMode('reading')).toMatchObject({ kind: 'working', target: 'down_work_left' });
    expect(presenceForMode('reasoning')).toMatchObject({ kind: 'working', target: 'internal_focus' });
    for (const mode of ['idle_watch', 'blocked', 'degraded_offline']) expect(presenceForMode(mode).kind).toBe('ambient');
  });

  it('permits automatic entertainment only during visible, fresh, healthy idle watch', () => {
    const { allowsIdlePerformance } = api();
    expect(allowsIdlePerformance({ mode: 'idle_watch' })).toBe(true);
    for (const mode of ['reasoning', 'reading', 'searching', 'tool_shell', 'writing', 'listening', 'waiting_user', 'complete', 'blocked', 'degraded_offline']) {
      expect(allowsIdlePerformance({ mode }), mode).toBe(false);
    }
    for (const override of [{ hidden: true }, { freshness: 'stale' }, { freshness: 'unknown' }, { health: 'critical' }, { quiet: 'night' }]) {
      expect(allowsIdlePerformance({ mode: 'idle_watch', ...override })).toBe(false);
    }
  });

  it('varies wordless idle pieces without repeating the previous piece', () => {
    const { chooseIdleSequence } = api();
    const catalog = JSON.parse(fs.readFileSync(new URL('../src/mascot/sequences.json', import.meta.url), 'utf8'));
    for (const previous of ['aurora_breath', 'sleepy_lantern', 'magnet_motes']) {
      for (const sample of [0, .5, .999, 1, NaN]) {
        const next = chooseIdleSequence(previous, () => sample);
        expect(next).not.toBe(previous);
        const sequence = catalog.sequences.find(entry => entry.id === next);
        expect(sequence).toBeDefined();
        expect(sequence.steps.some(step => ['SPEAK', 'TTS'].includes(step.event))).toBe(false);
      }
    }
  });
});

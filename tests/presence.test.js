import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';

function api() {
  const context = vm.createContext({ window: {}, URLSearchParams });
  vm.runInContext(fs.readFileSync(new URL('../src/mascot/presence.js', import.meta.url), 'utf8'), context);
  return context.window.HermesPresence;
}

describe('presence without workflow assumptions', () => {
  it('gives errors and unavailable telemetry priority over decorative activity colors', () => {
    const { themeForObservation } = api();
    expect(themeForObservation({ mode: 'reasoning' }).name).toBe('thinking');
    expect(themeForObservation({ mode: 'tool_shell' }).name).toBe('working');
    expect(themeForObservation({ mode: 'reasoning', critical: true }).name).toBe('error');
    expect(themeForObservation({ mode: 'complete', freshness: 'lost' }).name).toBe('offline');
    expect(themeForObservation({ mode: 'complete', gatewayOk: false }).name).toBe('offline');
    expect(themeForObservation({ mode: 'reading', freshness: 'stale' }).name).toBe('waiting');
  });

  it('allows the upgraded host more headroom while preserving a conservative option', () => {
    const { motionBudget } = api();
    const warmHost = { cpu: .84, temp_c: 81 };
    expect(motionBudget(warmHost, { p95Ms: 30 }, false)).toBe('high');
    expect(motionBudget(warmHost, { p95Ms: 30 }, true)).toBe('low');
    expect(motionBudget({ temp_c: 87 }, {}, false)).toBe('medium');
    expect(motionBudget({ temp_c: 93 }, {}, false)).toBe('low');
    expect(motionBudget({}, { p95Ms: 56 }, false)).toBe('low');
    expect(motionBudget({ cpu: 96 }, {}, false)).toBe('medium');
  });

  it('keeps the membrane bounded and finite through all modes and invalid inputs', () => {
    const { surfacePaths, materialForMode } = api();
    for (const mode of ['idle_watch', 'reasoning', 'searching', 'blocked', 'degraded_offline', 'unknown']) {
      const { focus, energy } = materialForMode(mode);
      for (const time of [0, 100000, NaN, Infinity]) {
        const paths = surfacePaths(time, focus, energy, 99999, -99999);
        expect(paths).toHaveLength(6);
        for (const path of paths) {
          expect(path).not.toMatch(/NaN|Infinity/);
          const coords = path.match(/-?\d+(?:\.\d+)?/g).map(Number);
          expect(Math.min(...coords)).toBeGreaterThan(320);
          expect(Math.max(...coords)).toBeLessThan(780);
        }
      }
    }
  });

  it('does not treat a return to reading as an invalid or completed phase', () => {
    const { materialForMode } = api();
    const modes = ['reading', 'reasoning', 'tool_shell', 'reading'];
    expect(modes.map(materialForMode)[0]).toEqual(modes.map(materialForMode)[3]);
    expect(materialForMode('blocked').energy).toBeLessThan(materialForMode('searching').energy);
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

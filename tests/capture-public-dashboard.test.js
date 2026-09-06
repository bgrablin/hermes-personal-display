import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { freezeOpenEye } = require('../scripts/capture-public-dashboard.cjs');

function pageFor(rig) {
  return {
    evaluate: (callback, options) => {
      globalThis.window = { __HERMES_CONCEPT_B_EYE_MOTION: rig };
      return callback(options);
    },
  };
}

function installFrameQueue({ runFrames = true } = {}) {
  const frames = new Map();
  let nextId = 1;
  const cancelFrame = vi.fn((id) => frames.delete(id));
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = nextId++;
    frames.set(id, callback);
    if (runFrames) {
      setTimeout(() => {
        if (frames.delete(id)) callback(performance.now());
      }, 1);
    }
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  return { cancelFrame, frames };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete globalThis.window;
});

describe('public dashboard open-eye capture gate', () => {
  it('freezes only after two consecutive open-eye frames', async () => {
    vi.useFakeTimers();
    const { cancelFrame } = installFrameQueue();
    const blinkValues = [0.6, 0.01, 0.01];
    const rig = {
      debug: vi.fn(() => ({ blink: blinkValues.shift() ?? 0.01 })),
      teardown: vi.fn(),
    };

    const pending = freezeOpenEye(pageFor(rig), { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(5);

    await expect(pending).resolves.toBeLessThanOrEqual(0.02);
    expect(rig.debug).toHaveBeenCalledTimes(3);
    expect(rig.teardown).toHaveBeenCalledOnce();
    expect(cancelFrame).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects on an independent timeout when animation frames stop', async () => {
    vi.useFakeTimers();
    const { cancelFrame } = installFrameQueue({ runFrames: false });
    const rig = { debug: vi.fn(), teardown: vi.fn() };
    let outcome = 'pending';

    freezeOpenEye(pageFor(rig), { timeoutMs: 25 }).then(
      () => { outcome = 'resolved'; },
      (error) => { outcome = error.message; },
    );
    await vi.advanceTimersByTimeAsync(25);

    expect(outcome).toBe('eye did not reach a stable open frame before capture');
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(rig.debug).not.toHaveBeenCalled();
    expect(rig.teardown).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects and cleans up when reading blink state throws', async () => {
    vi.useFakeTimers();
    const { cancelFrame } = installFrameQueue();
    const rig = {
      debug: vi.fn(() => { throw new Error('debug failed'); }),
      teardown: vi.fn(),
    };
    const pending = freezeOpenEye(pageFor(rig), { timeoutMs: 50 });
    const rejection = expect(pending).rejects.toThrow('debug failed');

    await vi.advanceTimersByTimeAsync(1);

    await rejection;
    expect(cancelFrame).not.toHaveBeenCalled();
    expect(rig.teardown).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects and cleans up when renderer teardown throws', async () => {
    vi.useFakeTimers();
    const { cancelFrame } = installFrameQueue();
    const rig = {
      debug: vi.fn(() => ({ blink: 0 })),
      teardown: vi.fn(() => { throw new Error('teardown failed'); }),
    };
    const pending = freezeOpenEye(pageFor(rig), { timeoutMs: 50 });
    const rejection = expect(pending).rejects.toThrow('teardown failed');

    await vi.advanceTimersByTimeAsync(2);

    await rejection;
    expect(rig.teardown).toHaveBeenCalledOnce();
    expect(cancelFrame).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

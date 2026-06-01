(() => {
  function immediateApply(options = {}) {
    const targets = Array.isArray(options.targets) ? options.targets : [options.targets].filter(Boolean);
    const reserved = new Set(['targets', 'duration', 'easing', 'complete', 'update', 'delay', 'loop', 'direction', 'autoplay']);
    for (const target of targets) {
      for (const [key, value] of Object.entries(options)) {
        if (reserved.has(key)) continue;
        const finalValue = Array.isArray(value) ? value[value.length - 1] : value;
        if (target && typeof target.setAttribute === 'function' && key.startsWith('attr:')) {
          target.setAttribute(key.slice(5), finalValue);
        } else if (target && typeof target === 'object') {
          target[key] = finalValue;
        }
      }
    }
    if (typeof options.update === 'function') options.update({ progress: 100 });
    if (typeof options.complete === 'function') options.complete();
    return { pause() {}, restart() {} };
  }

  function resolveAnime() {
    const candidate = window.anime;
    if (typeof candidate === 'function') return { animate: candidate, signature: 'options' };
    if (candidate?.default && typeof candidate.default === 'function') return { animate: candidate.default, signature: 'options' };
    if (candidate?.animate && typeof candidate.animate === 'function') return { animate: candidate.animate, signature: 'targets-params' };
    return null;
  }

  function normalizeAnimeEase(easing) {
    const eases = {
      easeOutQuad: 'outQuad',
      easeInQuad: 'inQuad',
      easeInOutSine: 'inOutSine',
      easeOutSine: 'outSine',
      easeInSine: 'inSine',
    };
    return eases[easing] || easing;
  }

  function legacyAnimeEase(easing) {
    const eases = {
      outQuad: 'easeOutQuad',
      inQuad: 'easeInQuad',
      inOutSine: 'easeInOutSine',
      outSine: 'easeOutSine',
      inSine: 'easeInSine',
    };
    return eases[easing] || easing;
  }

  function animeV4Params(animationOptions = {}) {
    const { targets, easing, complete, update, direction, ...params } = animationOptions;
    const normalized = {
      ...params,
      ease: params.ease || normalizeAnimeEase(easing),
      onComplete: params.onComplete || complete,
      onUpdate: params.onUpdate || update,
    };
    if (direction === 'alternate') normalized.alternate = true;
    return normalized;
  }

  function animeLegacyOptions(animationOptions = {}) {
    const { ease, alternate, ...options } = animationOptions;
    const normalized = { ...options };
    if (ease && !normalized.easing) normalized.easing = ease;
    if (normalized.easing) normalized.easing = legacyAnimeEase(normalized.easing);
    if (alternate && !normalized.direction) normalized.direction = 'alternate';
    return normalized;
  }

  function runAnime(animeApi, animationOptions = {}) {
    if (animeApi.signature === 'targets-params') {
      const targets = animationOptions.targets;
      return animeApi.animate(targets, animeV4Params(animationOptions));
    }
    return animeApi.animate(animeLegacyOptions(animationOptions));
  }

  let cachedAnimeApi = null;
  function getAnimeApi() {
    if (cachedAnimeApi) return cachedAnimeApi;
    cachedAnimeApi = resolveAnime();
    return cachedAnimeApi;
  }

  function createMotionAdapter(options = {}) {
    const prefersReducedMotion = Boolean(options.prefersReducedMotion);
    const animeApi = getAnimeApi();
    return {
      hasAnime: Boolean(animeApi),
      prefersReducedMotion,
      animateValue(animationOptions = {}) {
        if (prefersReducedMotion || !animeApi) return immediateApply(animationOptions);
        return runAnime(animeApi, animationOptions);
      },
      transitionCss(targets, props = {}, timing = {}) {
        return this.animateValue({
          targets,
          ...props,
          duration: timing.duration ?? 280,
          easing: timing.easing || 'outQuad',
          complete: timing.complete,
          update: timing.update,
        });
      },
      pulse(targets, props = {}, timing = {}) {
        return this.animateValue({
          targets,
          ...props,
          duration: timing.duration ?? 420,
          easing: timing.easing || 'inOutSine',
          alternate: true,
          loop: timing.loop ?? 1,
          complete: timing.complete,
        });
      },
    };
  }

  window.HermesMotionAdapter = {
    createMotionAdapter,
    immediateApply,
  };
})();

(() => {
  const DEFAULT_ALLOWED_TAGS = ['b', 'strong', 'i', 'em', 'code', 'span', 'br'];
  const DEFAULT_ALLOWED_ATTR = ['class', 'aria-label'];
  const SECRET_PATTERN = /(api[_-]?key|token|password|passwd|secret|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-|ghp_[a-z0-9_]+)/i;

  function stripHtml(value) {
    return String(value ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function captionText(value, fallback = '', maxLength = 96) {
    const text = stripHtml(value || fallback);
    if (!text || SECRET_PATTERN.test(text)) return fallback || '';
    return text.slice(0, maxLength);
  }

  function captionHtml(value, options = {}) {
    const raw = String(value ?? '');
    if (!raw || SECRET_PATTERN.test(raw)) return '';
    const purifier = window.DOMPurify;
    if (!purifier?.sanitize) return captionText(raw, '', options.maxLength || 160);
    return purifier.sanitize(raw, {
      ALLOWED_TAGS: options.allowedTags || DEFAULT_ALLOWED_TAGS,
      ALLOWED_ATTR: options.allowedAttr || DEFAULT_ALLOWED_ATTR,
      RETURN_TRUSTED_TYPE: false,
    });
  }

  window.HermesSanitize = {
    captionText,
    captionHtml,
    stripHtml,
  };
})();

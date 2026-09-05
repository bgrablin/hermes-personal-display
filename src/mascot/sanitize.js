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

  // Text-only private operator rendering. Content words and paths are useful;
  // only credential values are masked. Never use this to authorize commands.
  function operatorText(value, maxLength = 320) {
    let text = String(value ?? '');
    const patterns = [
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
      /\b(?:authorization|proxy-authorization|cookie|set-cookie)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\r\n]+)/gi,
      /\b(?:access[_-]?token|refresh[_-]?token|token|api[_-]?key|access[_-]?key|secret[_-]?key|client[_-]?secret|password|passwd|secret)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s"'&,;}\]]+)/gi,
      /[?&](?:token|key|auth|signature|sig|x-amz-signature|x-goog-signature)=[^\s&#"']+/gi,
      /\bbearer\s+[A-Za-z0-9._~+/=\-]{16,}/gi,
      /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,})(?:\.\.\.[A-Za-z0-9_-]+)?/g,
      /\b(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{2,}\.\.\.[A-Za-z0-9_-]{2,}\b/g,
      /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    ];
    for (const pattern of patterns) text = text.replace(pattern, '[redacted]');
    text = text.replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
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
    operatorText,
    captionText,
    captionHtml,
    stripHtml,
  };
})();

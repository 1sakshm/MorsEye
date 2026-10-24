/**
 * A deliberately small Markdown renderer for trusted repository files (AI_USE.md).
 * It escapes all HTML first, then supports headings, paragraphs, lists, block quotes,
 * fenced code, inline code, bold, italic and links (http/https/mailto/relative only).
 * Tables are shown as preformatted text.
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h) || /^[./#]/.test(h) || /^[\w-]+(\.[\w-]+)*(\/|$)/.test(h)) {
    return /^javascript:/i.test(h) ? null : h;
  }
  return null;
}

function inline(text: string): string {
  // Code spans first, so their content is not formatted.
  const parts = esc(text).split(/(`[^`]+`)/g);
  return parts
    .map((p) => {
      if (p.startsWith('`') && p.endsWith('`') && p.length > 1)
        return `<code>${p.slice(1, -1)}</code>`;
      return p
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
          const safe = safeHref(href.replace(/&amp;/g, '&'));
          return safe ? `<a href="${esc(safe)}">${label}</a>` : label;
        })
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
        .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<em>$2</em>');
    })
    .join('');
}

/** Renders Markdown to HTML. `headingOffset` demotes headings (# → h{1+offset}). */
export function renderMarkdown(md: string, headingOffset = 2): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^```/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(6, h[1]!.length + headingOffset);
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) body.push(lines[i++]!);
      out.push(`<pre class="md-table">${esc(body.join('\n'))}</pre>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!))
        body.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(body.join('\n'), headingOffset)}</blockquote>`);
      continue;
    }
    const list = line.match(/^\s*([-*+]|\d+[.)])\s+/);
    if (list) {
      const ordered = /\d/.test(list[1]!);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) {
        let item = lines[i++]!.replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        // Continuation lines (indented, not a new item).
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]!) &&
          !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)
        ) {
          item += ' ' + lines[i++]!.trim();
        }
        items.push(`<li>${inline(item)}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,6}\s|```|\s*>|\s*\||\s*([-*+]|\d+[.)])\s+)/.test(lines[i]!)
    ) {
      para.push(lines[i++]!.trim());
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

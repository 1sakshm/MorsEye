import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { renderMarkdown } from './src/site/markdown';

const page = (p: string) => resolve(__dirname, p);

/** Replaces <!--#include head|header|footer--> with src/partials/*.html, so every page shares one copy. */
function partials(): Plugin {
  return {
    name: 'morseye-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replace(/<!--#include (\w+)-->/g, (_, name: string) =>
            readFileSync(page(`src/partials/${name}.html`), 'utf8'),
          )
          // <!--#markdown FILE.md--> renders a repository Markdown file at build time (no layout shift).
          .replace(/<!--#markdown ([\w.-]+\.md)-->/g, (_, file: string) =>
            renderMarkdown(readFileSync(page(file), 'utf8'), 2),
          ),
    },
  };
}

// Multi-page build (PRD §6.2). /study and /labeler are built but not linked from the nav.
export default defineConfig({
  plugins: [partials()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        home: page('index.html'),
        try: page('try/index.html'),
        how: page('how/index.html'),
        research: page('research/index.html'),
        data: page('data/index.html'),
        about: page('about/index.html'),
        study: page('study/index.html'),
        labeler: page('labeler/index.html'),
      },
    },
  },
});

import '../site/layout';
import '../styles/prose.css';
import aiUse from '../../AI_USE.md?raw';

// AI_USE.md is rendered into the page at build time (vite.config.ts), verbatim.
const pending = document.getElementById('ai-use-pending');
// A placeholder still marked [HUMAN], or almost empty, has not been written yet.
if (pending) pending.hidden = !(/\[HUMAN\]/.test(aiUse) || aiUse.trim().length < 200);

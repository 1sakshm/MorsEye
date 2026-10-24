import '../site/layout';
import '../styles/prose.css';
import aiUse from '../../AI_USE.md?raw';
import { renderMarkdown } from '../site/markdown';

// AI_USE.md is written by Saksham; the page only displays it, verbatim.
const body = document.getElementById('ai-use-body');
const pending = document.getElementById('ai-use-pending');
if (body) body.innerHTML = renderMarkdown(aiUse, 2);
// A placeholder still marked [HUMAN], or almost empty, has not been written yet.
if (pending) pending.hidden = !(/\[HUMAN\]/.test(aiUse) || aiUse.trim().length < 200);

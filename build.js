import { readFile, writeFile } from 'node:fs/promises';
const files = ['data.js', 'store.js', 'app.js'];
const sources = await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')));
const body = sources.map(source => source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
await writeFile(new URL('bundle.js', import.meta.url), `// Gerado por node build.js. Edite os arquivos fonte.\n(() => {\n${body}\n})();\n`);

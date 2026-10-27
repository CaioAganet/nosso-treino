import { readFile, writeFile } from 'node:fs/promises';
const files = ['data.js', 'store.js', 'partner-ui.js', 'app.js'];
const sources = await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')));
const body = sources.map(source => source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
await writeFile(new URL('bundle.js', import.meta.url), `// Gerado por node build.js. Edite os arquivos fonte.\n(() => {\n${body}\n})();\n`);

const {build}=await import('esbuild');
await build({entryPoints:['cloud.js'],bundle:true,format:'iife',platform:'browser',target:['es2020'],outfile:'cloud-bundle.js',minify:true,legalComments:'eof'});

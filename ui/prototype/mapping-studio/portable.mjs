import { cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const entry = new URL('./dist/index.html', import.meta.url);
let html = await readFile(entry, 'utf8');
const scriptTag = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const styleTag = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/);
if (!scriptTag || !styleTag) throw new Error('Missing built JavaScript or stylesheet.');
const js = await readFile(new URL(scriptTag[1], entry), 'utf8');
const css = await readFile(new URL(styleTag[1], entry), 'utf8');
html = html.replace(scriptTag[0], () => '<script type="module">' + js.replace(/<\/script/gi, '<\\/script') + '</script>');
html = html.replace(styleTag[0], () => '<style>' + css + '</style>');
await writeFile(new URL('./Mapping-studio.html', import.meta.url), html);
// The recorded SAP walkthroughs are optional local evidence for the preview.
const guides = ['definition-detail','function-dialogs','function-palette','test-detail','signature-detail','functions-detail'];
for (const guide of guides) {
  const source = new URL('./sap-predloha/'+guide+'/', import.meta.url);
  if (existsSync(source)) await cp(source, new URL('./'+guide+'/', entry), {
    recursive:true,
    filter:path=>!/[\\/](?:libs|\.settings)(?:[\\/]|$)/.test(path) && !/[\\/]\.(?:project|classpath)$/.test(path)
  });
}

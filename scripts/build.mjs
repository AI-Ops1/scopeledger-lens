import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const out = new URL('../dist/',import.meta.url);
await mkdir(new URL('api/',out), {recursive:true});
for (const file of ['index.html','how-it-works.html','style.css','app.js','handoff.mjs','logo.svg']) await copyFile(new URL('../public/'+file,import.meta.url),new URL(file,out));
await copyFile(new URL('../analysis.mjs',import.meta.url),new URL('analysis.mjs',out));
const index = await readFile(new URL('index.html',out),'utf8');
await writeFile(new URL('index.html',out),index.replace(/<option value="hosted">[^<]*<\/option>/,''));
await writeFile(new URL('api/config.json',out),JSON.stringify({ready:false,access_required:false,review_url:'',model:null}));
console.log('Static own-AI site built in dist.');

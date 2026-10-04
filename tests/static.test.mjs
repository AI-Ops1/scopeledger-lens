import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
test('static publish contains working shared module and config, excludes hosted option and secrets', async () => {
 const root = new URL('../', import.meta.url);
 assert.ok(existsSync(new URL('scripts/build.mjs',root)), 'static build is required');
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root});
 const page = await readFile(new URL('dist/index.html',root),'utf8');
 assert.ok(!page.includes('value="hosted"'));
 assert.ok(existsSync(new URL('dist/analysis.mjs',root)));
 assert.ok(!existsSync(new URL('dist/.env',root)));
 assert.ok(!existsSync(new URL('dist/server.mjs',root)));
 assert.equal(JSON.parse(await readFile(new URL('dist/api/config.json',root),'utf8')).ready,false);
});

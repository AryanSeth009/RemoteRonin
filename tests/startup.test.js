import test from 'node:test';
import assert from 'node:assert/strict';
import { startupLines } from '../src/cli/runtime.js';

const tools=['Git','Node.js','npm','Codex CLI','Claude Code','OpenCode','VS Code'].map((name,index)=>({id:String(index),name,installed:index!==5,healthy:index%3!==0,version:'1.0.'+index}));
const stripAnsi=value=>value.replace(/\x1b\[[0-9;]*m/g,'');
const visibleWidth=lines=>lines.reduce((widest,line)=>Math.max(widest,stripAnsi(line).length),0);
const dots=lines=>lines.join('').split('\u25cf').length-1;
const sizes=[[80,24],[100,30],[120,40],[155,49],[160,60],[200,80],[240,80],[400,120],[60,20],[48,24]];

for(const [columns,rows] of sizes){
 test(`startup screen fits ${columns}x${rows}`,()=>{
  const lines=startupLines({columns,rows,tools});
  assert.ok(lines.length<=rows,`rendered ${lines.length} lines for ${rows} rows`);
  assert.ok(visibleWidth(lines)<=columns,`rendered ${visibleWidth(lines)} columns for ${columns}`);
 });
}

test('portrait grows with a taller viewport and never upscales past the source',()=>{
 const art=rows=>dots(startupLines({columns:160,rows,tools}));
 assert.ok(art(49)<art(60),'a taller viewport should show a larger portrait');
 assert.equal(art(400),art(120),'the portrait should not upscale past its native 50 rows');
 assert.ok(art(400)>0);
});

test('portrait is dropped on short screens and can be switched off',()=>{
 assert.equal(dots(startupLines({columns:80,rows:24,tools})),0);
 assert.equal(dots(startupLines({columns:160,rows:60,tools,showArtwork:false})),0);
 assert.ok(dots(startupLines({columns:160,rows:60,tools}))>0);
 assert.ok(dots(startupLines({columns:120,rows:30,tools}))>0,'a 30-row terminal should still show a portrait');
});

test('monochrome and narrow terminals fall back to the compact mark',()=>{
 const mono=startupLines({columns:160,rows:60,tools,color:false});
 const narrow=startupLines({columns:52,rows:60,tools});
 for(const lines of [mono,narrow]){assert.equal(dots(lines),0);assert.ok(lines.join('\n').includes('REMOTE RONIN'));}
 assert.ok(!mono.join('').includes('\x1b['),'monochrome output must not contain ANSI escapes');
});

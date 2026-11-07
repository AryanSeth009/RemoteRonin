import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, parseInput } from '../src/cli/runtime.js';

test('parses slash commands and quoted paths',()=>assert.deepEqual(parseInput('/project add "D:\\My App" Demo'),['project','add','D:\\My App','Demo']));
test('rejects unterminated quotes',()=>assert.throws(()=>parseInput('/project add "bad'),/Unterminated/));
test('installer refuses noninteractive changes without explicit approval',async()=>{const result=await execute(['setup','install','recommended']);assert.equal(result.ok,false);assert.equal(result.title,'SETUP APPROVAL REQUIRED');});

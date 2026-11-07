#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const C={reset:'\x1b[0m',gold:'\x1b[38;2;255;202;40m',muted:'\x1b[38;2;157;124;32m',green:'\x1b[32m',red:'\x1b[31m',crimson:'\x1b[38;2;235;30;52m',darkRed:'\x1b[38;2;110;12;24m',yellow:'\x1b[33m',gray:'\x1b[90m',white:'\x1b[97m',bold:'\x1b[1m'};
const appData=process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming');
let dataDir=process.env.REMOTERONIN_HOME||process.env.DEVREMOTE_HOME||path.join(appData,'RemoteRonin'); let configFile=path.join(dataDir,'config.json'); let logFile=path.join(dataDir,'logs','remoteronin.ndjson');
let storageReady=false;
function useWorkspaceStorage(){dataDir=path.resolve('.remoteronin');configFile=path.join(dataDir,'config.json');logFile=path.join(dataDir,'logs','remoteronin.ndjson');storageReady=false;}
async function ensureStorage(){if(storageReady)return;try{await fs.mkdir(dataDir,{recursive:true});}catch(e){if(!['EPERM','EACCES','EROFS'].includes(e.code))throw e;useWorkspaceStorage();await fs.mkdir(dataDir,{recursive:true});}storageReady=true;}
const defaults=()=>({version:1,projects:[],screenshotDirectory:path.join(dataDir,'screenshots'),showArtwork:true});
const color=(level)=>level==='OK'?C.green:level==='ERROR'?C.red:level==='WARN'?C.yellow:C.white;
const out=(title,lines,ok=true,data)=>({title,lines,ok,data}); const item=(level,message)=>({level,message});
const redact=(s)=>s.replace(/(token|secret|password|pin|api[-_]?key)\s*[=:]\s*\S+/gi,'$1=[REDACTED]');

export function parseInput(input){const source=input.trim().replace(/^\//,'');const values=[];let current='',quote=null;for(const ch of source){if(quote){if(ch===quote)quote=null;else current+=ch;}else if(ch==='"'||ch==="'")quote=ch;else if(/\s/.test(ch)){if(current){values.push(current);current='';}}else current+=ch;}if(quote)throw new Error('Unterminated quote.');if(current)values.push(current);return values;}
function run(command,args=[],cwd,timeout=10000){return new Promise(resolve=>{let stdout='',stderr='',done=false,child;const finish=(code)=>{if(done)return;done=true;clearTimeout(timer);resolve({code,stdout:stdout.trim(),stderr:stderr.trim()});};let timer;try{const lower=command.toLowerCase();const actual=process.platform==='win32'&&lower.endsWith('.cmd')?'cmd.exe':process.platform==='win32'&&lower.endsWith('.ps1')?'powershell.exe':command;const actualArgs=actual==='cmd.exe'?['/d','/s','/c',command,...args]:actual==='powershell.exe'?['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',command,...args]:args;child=spawn(actual,actualArgs,{cwd,windowsHide:true,shell:false,env:process.env});timer=setTimeout(()=>{child.kill();stderr+='\nTimed out';finish(124);},timeout);child.stdout?.on('data',d=>stdout+=d);child.stderr?.on('data',d=>stderr+=d);child.on('error',e=>{stderr=e.message;finish(127);});child.on('close',c=>finish(c??1));}catch(e){stderr=e.message;finish(127);}});}
async function load(){await ensureStorage();try{const c=JSON.parse(await fs.readFile(configFile,'utf8'));if(c.version!==1||!Array.isArray(c.projects))throw new Error('unsupported schema');return c;}catch(e){if(e.code==='ENOENT')return defaults();throw new Error(`Invalid configuration: ${e.message}`);}}
async function save(config){await ensureStorage();const write=async()=>{await fs.mkdir(path.dirname(configFile),{recursive:true});const temp=configFile+'.tmp';await fs.writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600});await fs.rename(temp,configFile);};try{await write();}catch(e){if(!['EPERM','EACCES','EROFS'].includes(e.code)||dataDir===path.resolve('.remoteronin'))throw e;useWorkspaceStorage();await ensureStorage();await write();}}
async function log(level,event,message){const write=async()=>{await ensureStorage();await fs.mkdir(path.dirname(logFile),{recursive:true});await fs.appendFile(logFile,JSON.stringify({timestamp:new Date().toISOString(),level,component:'command',event,message:redact(message)})+'\n');};try{await write();}catch(e){if(!['EPERM','EACCES','EROFS'].includes(e.code)||dataDir===path.resolve('.remoteronin'))throw e;useWorkspaceStorage();await write();}}

const toolDefs=[['git','Git',['git'],['--version']],['node','Node.js',['node'],['--version']],['npm','npm',['npm.cmd','npm'],['--version']],['codex','Codex CLI',['codex.cmd','codex'],['--version']],['claude','Claude Code',['claude.exe','claude'],['--version']],['opencode','OpenCode',['opencode.cmd','opencode'],['--version']],['vscode','VS Code',['code.cmd','code'],['--version']]];
async function detectTools(){return Promise.all(toolDefs.map(async([id,name,commands,args])=>{for(const command of commands){const where=await run('where.exe',[command],undefined,3000);if(where.code)continue;const version=await run(command,args,undefined,5000);return{id,name,installed:true,healthy:version.code===0,path:where.stdout.split(/\r?\n/)[0],version:version.code===0?(version.stdout||version.stderr).split(/\r?\n/)[0]||'UNKNOWN':'VERSION CHECK FAILED'};}return{id,name,installed:false,healthy:false};}));}
async function remoteStatus(){const roots=[process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)',process.env.ProgramFiles||'C:\\Program Files'];let hostPath;for(const root of roots){const candidate=path.join(root,'Google','Chrome Remote Desktop','CurrentVersion','remoting_host.exe');try{await fs.access(candidate);hostPath=candidate;break;}catch{}}const service=await run('sc.exe',['query','chromoting'],undefined,5000);return{installed:Boolean(hostPath)||service.code===0,service:service.code?'NOT FOUND':/RUNNING/.test(service.stdout)?'RUNNING':/STOPPED/.test(service.stdout)?'STOPPED':'UNKNOWN',hostPath,configuration:'VERIFICATION REQUIRED'};}
async function projectState(){const c=await load();return{config:c,active:c.projects.find(p=>p.id===c.activeProjectId)};}
async function active(){const s=await projectState();if(!s.active)throw new Error('No active project. Run /project add <path>.');await fs.access(s.active.path);return s.active;}

const installerCatalog={
 git:{name:'Git',kind:'winget',package:'Git.Git',tool:'git'},
 node:{name:'Node.js LTS + npm',kind:'winget',package:'OpenJS.NodeJS.LTS',tool:'node'},
 vscode:{name:'Visual Studio Code',kind:'winget',package:'Microsoft.VisualStudioCode',tool:'vscode'},
 codex:{name:'Codex CLI',kind:'npm-global',package:'@openai/codex@latest',tool:'codex'},
 claude:{name:'Claude Code',kind:'npm-global',package:'@anthropic-ai/claude-code',tool:'claude'},
 browser:{name:'Playwright + Chromium',kind:'playwright'},
 remote:{name:'Chrome Remote Desktop',kind:'official-page'},
 opencode:{name:'OpenCode',kind:'download-page'}
};
async function hasPlaywright(){try{await import('playwright');return true;}catch{return false;}}
async function installOne(id,tools){
 const definition=installerCatalog[id]; if(!definition)return{ok:false,message:`Unknown installer target: ${id}`};
 const detected=definition.tool&&tools.find(tool=>tool.id===definition.tool);
 if(detected?.healthy)return{ok:true,message:`${definition.name}: already installed (${detected.version})`};
 if(id==='browser'&&await hasPlaywright())return{ok:true,message:'Playwright: already installed'};
 if(definition.kind==='official-page'){const opened=await run('cmd.exe',['/c','start','','https://remotedesktop.google.com/access'],undefined,10000);return{ok:opened.code===0,message:opened.code===0?'Chrome Remote Desktop official setup opened; complete Google sign-in and choose your own PIN.':`Could not open Chrome Remote Desktop setup: ${opened.stderr||'unknown error'}`};}
 if(definition.kind==='download-page'){const opened=await run('cmd.exe',['/c','start','','https://opencode.ai/docs'],undefined,10000);return{ok:opened.code===0,message:opened.code===0?'OpenCode official download page opened; Windows package-manager installation is not currently automated.':`Could not open OpenCode documentation: ${opened.stderr||'unknown error'}`};}
 if(definition.kind==='winget'){
  const available=await run('winget.exe',['--version'],undefined,10000); if(available.code!==0)return{ok:false,message:`${definition.name}: Windows Package Manager is unavailable (${available.stderr||'winget could not start'}).`};
  const installed=await run('winget.exe',['install','--id',definition.package,'--exact','--source','winget','--accept-source-agreements','--accept-package-agreements'],undefined,600000);
  return{ok:installed.code===0,message:installed.code===0?`${definition.name}: installation completed`:`${definition.name}: installation failed (${installed.stderr||installed.stdout||`exit ${installed.code}`})`};
 }
 if(definition.kind==='npm-global'){
  const installed=await run('npm.cmd',['install','--global',definition.package],undefined,600000);
  return{ok:installed.code===0,message:installed.code===0?`${definition.name}: installation completed`:`${definition.name}: installation failed (${installed.stderr||installed.stdout||`exit ${installed.code}`})`};
 }
 if(definition.kind==='playwright'){
  const packageInstall=await run('npm.cmd',['install','--save-optional','playwright'],process.cwd(),600000); if(packageInstall.code!==0)return{ok:false,message:`Playwright package installation failed (${packageInstall.stderr||packageInstall.stdout||`exit ${packageInstall.code}`})`};
  const browserInstall=await run('npx.cmd',['playwright','install','chromium'],process.cwd(),600000); return{ok:browserInstall.code===0,message:browserInstall.code===0?'Playwright and Chromium: installation completed':`Chromium installation failed (${browserInstall.stderr||browserInstall.stdout||`exit ${browserInstall.code}`})`};
 }
 return{ok:false,message:`${definition.name}: unsupported installer method`};
}
async function installSelection(selection){
 const groups={required:['node','git','remote'],ai:['codex','claude','opencode'],browser:['browser'],recommended:['node','git','vscode','codex','claude','opencode','browser','remote']};
 const ids=groups[selection]||[selection]; const tools=await detectTools(); const lines=[]; let ok=true;
 for(const id of ids){const installed=await installOne(id,tools);ok&&=installed.ok;lines.push(item(installed.ok?'OK':'ERROR',installed.message));await log(installed.ok?'OK':'ERROR','installer',installed.message);}
 lines.push(item('INFO','Restart the terminal if a newly installed command is not detected yet.'));
 lines.push(item('WARN','Remote sign-in and PIN creation always remain manual.'));
 return out('SETUP INSTALLATION',lines,ok);
}

const help=[['/help','Show supported commands'],['/setup','Open guided installer menu'],['/setup install <group> --yes','Install required/ai/browser/recommended'],['/status','Show real host status'],['/tools','Detect developer tools'],['/doctor','Run diagnostics'],['/remote [open]','Inspect/open Chrome Remote Desktop'],['/projects','List registered projects'],['/project add <path> [name]','Register a project'],['/project select <name>','Select a project'],['/project remove <name>','Remove project registration'],['/changes','Show Git changes'],['/diff [--staged]','Show Git diff'],['/preview [url]','Check preview reachability'],['/screenshot [url]','Capture with optional Playwright'],['/logs','Show log location'],['/settings [url <url>]','Show/update settings'],['/clear','Clear interactive output'],['/exit','Exit']];
const handlers={
 help:async()=>out('COMMANDS',help.map(([a,b])=>item('INFO',a.padEnd(31)+b))),
 setup:async(args)=>{if(args[0]==='install'){const selection=args[1]||'required';if(!args.includes('--yes'))return out('SETUP APPROVAL REQUIRED',[item('WARN',`Installation group: ${selection}`),item('INFO',`Run /setup install ${selection} --yes after reviewing the changes, or use interactive /setup.`)],false);return installSelection(selection);}const[t,r,p,browser]=await Promise.all([detectTools(),remoteStatus(),projectState(),hasPlaywright()]);const required=['node','npm','git'].map(id=>t.find(x=>x.id===id)),missing=required.filter(x=>!x?.installed);const lines=[...required.map(x=>item(x?.healthy?'OK':'ERROR',`${x?.name||'Required tool'}: ${x?.installed?'INSTALLED':'MISSING'}`)),item(r.installed?'OK':'WARN',`Chrome Remote Desktop host: ${r.installed?'INSTALLED':'NOT FOUND'}`),item(browser?'OK':'WARN',`Browser verification: ${browser?'INSTALLED':'NOT INSTALLED'}`),item('WARN','Remote authorization and PIN: MANUAL USER ACTION REQUIRED'),item(p.active?'OK':'WARN',`Active project: ${p.active?.name||'NOT SELECTED'}`),item('INFO','Interactive installer menu is ready below.')];return out('SETUP',lines,missing.length===0,{setupWizard:true});},
 status:async()=>{const[t,r,p]=await Promise.all([detectTools(),remoteStatus(),projectState()]);return out('SYSTEM STATUS',[item('INFO',`Host: ${os.hostname()} · ${os.platform()} ${os.release()} · ${os.arch()}`),item('INFO',`Node: ${process.version}`),item('INFO',`Tools detected: ${t.filter(x=>x.installed).length}/${t.length}`),item(r.installed?'OK':'WARN',`Chrome Remote Desktop: ${r.installed?'INSTALLED':'NOT FOUND'} · ${r.service}`),item(p.active?'OK':'WARN',`Active project: ${p.active?.name||'NOT SELECTED'}`)]);},
 tools:async()=>{const tools=await detectTools();return out('DEVELOPER TOOLS',tools.map(t=>item(t.healthy?'OK':'WARN',`${t.name.padEnd(18)} ${t.installed?`INSTALLED · ${t.version}`:'NOT FOUND'}`)),true,tools);},
 remote:async(args)=>{const r=await remoteStatus(),lines=[item(r.installed?'OK':'WARN',`Host installation: ${r.installed?'INSTALLED':'NOT FOUND'}`),item(r.service==='RUNNING'?'OK':'WARN',`Host service: ${r.service}`),item('WARN',`Remote configuration: ${r.configuration}`),item('INFO','RemoteRonin never reads or stores your remote PIN.')];if(args[0]==='open'){const opened=await run('cmd.exe',['/c','start','','https://remotedesktop.google.com/access']);lines.push(item(opened.code?'ERROR':'OK','Opened official Chrome Remote Desktop access page.'));}else lines.push(item('INFO','Run /remote open to configure or verify access.'));return out('REMOTE ACCESS',lines);},
 projects:async()=>{const s=await projectState();return out('REGISTERED PROJECTS',s.config.projects.length?s.config.projects.map(p=>item(p.id===s.active?.id?'OK':'INFO',`${p.id===s.active?.id?'*':' '} ${p.name} · ${p.path}`)):[item('WARN','No projects registered. Use /project add <path>.')]);},
 project:async(args)=>{const c=await load();if(args[0]==='add'&&args[1]){const resolved=path.resolve(args[1]),stat=await fs.stat(resolved);if(!stat.isDirectory())throw new Error('Project path is not a directory.');let p=c.projects.find(x=>x.path.toLowerCase()===resolved.toLowerCase());if(!p){p={id:crypto.randomUUID(),name:args.slice(2).join(' ')||path.basename(resolved),path:resolved,addedAt:new Date().toISOString()};c.projects.push(p);}c.activeProjectId??=p.id;await save(c);return out('PROJECT ADDED',[item('OK',`${p.name} · ${p.path}`)]);}if(args[0]==='select'&&args[1]){const q=args.slice(1).join(' ').toLowerCase(),p=c.projects.find(x=>x.id===q||x.name.toLowerCase()===q);if(!p)throw new Error(`Project not found: ${args.slice(1).join(' ')}`);await fs.access(p.path);c.activeProjectId=p.id;await save(c);return out('PROJECT SELECTED',[item('OK',`${p.name} · ${p.path}`)]);}if(args[0]==='remove'&&args[1]){const q=args.slice(1).join(' ').toLowerCase(),index=c.projects.findIndex(x=>x.id===q||x.name.toLowerCase()===q);if(index<0)throw new Error(`Project not found: ${args.slice(1).join(' ')}`);const [removed]=c.projects.splice(index,1);if(c.activeProjectId===removed.id)c.activeProjectId=c.projects[0]?.id;await save(c);return out('PROJECT REMOVED',[item('OK',`${removed.name} registration removed; project files were not changed.`)]);}return out('PROJECT',[item('ERROR','Usage: /project add <path> [name], /project select <name>, or /project remove <name>')],false);},
 changes:async()=>{const p=await active(),r=await run('git',['status','--porcelain=v1','--branch'],p.path);if(r.code)throw new Error('The active project is not a Git repository.');const lines=r.stdout.split(/\r?\n/).filter(Boolean),head=lines.shift()||'';let branch=head.match(/^## No commits yet on (.+)$/)?.[1]||head.match(/^## Initial commit on (.+)$/)?.[1]||head.match(/^## ([^.\s]+)/)?.[1]||'UNKNOWN';return out(`CHANGES · ${p.name} · ${branch}`,lines.length?lines.map(x=>item('INFO',x)):[item('OK','Working tree is clean.')]);},
 diff:async(args)=>{const p=await active(),argv=['diff','--no-ext-diff','--no-color'];if(args.includes('--staged'))argv.push('--cached');const r=await run('git',argv,p.path,20000);if(r.code)throw new Error(r.stderr);return out(`DIFF · ${p.name}`,(r.stdout||'(no diff)').split(/\r?\n/).slice(0,400).map(x=>item(x.startsWith('+')?'OK':x.startsWith('-')?'ERROR':'INFO',x)));},
 preview:async(args)=>{const c=await load();if(args[0]){c.previewUrl=new URL(args[0]).toString();await save(c);}if(!c.previewUrl)throw new Error('No preview URL configured. Use /preview <url>.');const start=Date.now(),response=await fetch(c.previewUrl,{signal:AbortSignal.timeout(10000)}),data={url:c.previewUrl,status:response.status,elapsedMs:Date.now()-start};return out('PREVIEW',[item(response.ok?'OK':'ERROR',`${data.url} · HTTP ${data.status} · ${data.elapsedMs}ms`)],response.ok,data);},
 screenshot:async(args)=>{const c=await load(),url=args[0]||c.previewUrl;if(!url)throw new Error('No preview URL configured. Use /screenshot <url>.');let pw;try{pw=await import('playwright');}catch{throw new Error('Optional Playwright is not installed. Run npm install playwright, then npx playwright install chromium.');}await fs.mkdir(c.screenshotDirectory,{recursive:true});const target=path.join(c.screenshotDirectory,`preview-${new Date().toISOString().replace(/[:.]/g,'-')}.png`),browser=await pw.chromium.launch({headless:true}),page=await browser.newPage(),errors=[],failed=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failed.push(`${r.method()} ${r.url()}`));try{await page.goto(url,{waitUntil:'networkidle',timeout:30000});await page.screenshot({path:target,fullPage:true});}finally{await browser.close();}return out('BROWSER VERIFICATION',[item('OK',`Screenshot: ${target}`),item(errors.length?'ERROR':'OK',`Console errors: ${errors.length}`),item(failed.length?'WARN':'OK',`Failed requests: ${failed.length}`)],!errors.length,{path:target,errors,failed});},
 logs:async()=>out('LOGS',[item('INFO',logFile)]),
 settings:async(args)=>{const c=await load();if(args[0]==='url'&&args[1])c.previewUrl=new URL(args[1]).toString();if(args[0]==='art'&&['on','off'].includes(args[1]))c.showArtwork=args[1]==='on';if(args.length)await save(c);return out('SETTINGS',[item('INFO',`Config: ${configFile}`),item('INFO',`Preview URL: ${c.previewUrl||'NOT SET'}`),item('INFO',`Screenshots: ${c.screenshotDirectory}`),item('INFO',`Startup artwork: ${c.showArtwork===false?'OFF':'ON'} (/settings art on|off)`)]);},
 doctor:async()=>{const[t,r,p]=await Promise.all([detectTools(),remoteStatus(),projectState()]),checks=[item(process.platform==='win32'?'OK':'WARN',`Windows host: ${process.platform==='win32'?'PASS':'UNSUPPORTED'}`),item(t.some(x=>x.id==='node'&&x.installed)?'OK':'ERROR','Node.js'),item(t.some(x=>x.id==='git'&&x.installed)?'OK':'ERROR','Git'),item(r.installed?'OK':'WARN','Chrome Remote Desktop host'),item('WARN','Remote authorization: MANUAL VERIFICATION REQUIRED'),item(p.active?'OK':'WARN','Active project')];return out('DOCTOR',checks,!checks.some(x=>x.level==='ERROR'));}
};

export async function execute(tokens){const[name,...args]=tokens;if(!name)return out('REMOTE RONIN',[item('INFO','Type /help to see commands.')]);const handler=handlers[name.toLowerCase()];if(!handler)return out('UNKNOWN COMMAND',[item('ERROR',`Unknown command: /${name}`),item('INFO','Run /help for supported commands.')],false);try{const result=await handler(args);await log(result.ok?'OK':'WARN',name,`${result.title}: ${result.ok?'success':'failed'}`);return result;}catch(e){await log('ERROR',name,e.message);return out('COMMAND FAILED',[item('ERROR',e.message)],false);}}
function print(result){console.log(`\n${C.bold}${C.gold}${result.title}${C.reset}`);for(const l of result.lines)console.log(`${color(l.level)}[${l.level.padEnd(5)}]${C.reset} ${l.message}`);}
function portraitArt(){const r=C.red,w=C.white,g=C.gray,d=C.muted,z=C.reset;return[
 `${r}██${z}  ${g}▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄${z}  ${r}██${z}`,
 `${r}██${z} ${w}█${g}▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀${w}█${z} ${r}██${z}`,
 `${r}██${z} ${w}█${z}     ${g}╭───╮${z}          ${w}█${z} ${r}██${z}`,
 `${r}██${z} ${w}█${z}   ${g}──│ ◉ │──${z}        ${w}█${z} ${r}██${z}`,
 `${r}██${z} ${w}█${g}▄▄▄▄▄╰───╯▄▄▄▄▄▄▄${w}█${z} ${r}██${z}`,
 `${r}██${z}    ${g}╲${z}              ${g}╱${z}    ${r}██${z}`,
 `${r}██${z}     ${g}╲${z}  ${w}▄▄▄▄▄▄${z}  ${g}╱${z}     ${r}██${z}`,
 `${r}██${z}      ${g}╲${w}█${z} ${r}◉${z}  ${w}█${g}╱${z}      ${r}██${z}`,
 `${r}██${z}       ${g}╲${w}▀▄▄▀${g}╱${z}       ${r}██${z}`,
 `${r}██${z}      ${g}▄▀${z}  ${g}╲${z}          ${r}██${z}`,
 `${r}██${z}   ${g}▄▄▀${z}     ${g}╲▄▄${z}       ${r}██${z}`,
 `${r}████${z}${g}▀▀${z}  ${w}SHADOW LINK${z}  ${g}▀▀${z}${r}████${z}`,
 `${d}      REMOTE // OBSERVE // CONTROL${z}`
 ];}
async function banner(){const width=Math.min(process.stdout.columns||80,100),line='═'.repeat(Math.max(20,width-2));console.clear();console.log(`${C.gold}╔${line}╗${C.reset}`);console.log(`${C.gold}║${C.bold}${'DEVREMOTE AGENT'.padStart((line.length+15)/2).padEnd(line.length)}${C.reset}${C.gold}║${C.reset}`);console.log(`${C.gold}║${C.muted}${'Remote Developer Toolkit'.padStart((line.length+24)/2).padEnd(line.length)}${C.reset}${C.gold}║${C.reset}`);console.log(`${C.gold}║${'Built by Aryan Seth'.padStart((line.length+19)/2).padEnd(line.length)}║${C.reset}`);console.log(`${C.gold}╚${line}╝${C.reset}`);const c=await load();if(c.showArtwork!==false){console.log('');for(const artLine of portraitArt())console.log(artLine);}console.log(`${C.muted}\n TERMINAL  TOOLS  PROJECTS  REMOTE  CHANGES  LOGS  SETTINGS${C.reset}\n`);}
const ansiPattern=/\x1b\[[0-9;]*m/g;
const visibleLength=value=>value.replace(ansiPattern,'').length;
const centerLine=(value,width)=>' '.repeat(Math.max(0,Math.floor((width-visibleLength(value))/2)))+value;
function adaptivePortrait(width=80){
 const colorEnabled=process.env.NO_COLOR===undefined;
 const paint=(tone,value)=>colorEnabled?`${tone}${value}${C.reset}`:value;
 const r=value=>paint(C.crimson,value),dr=value=>paint(C.darkRed,value),w=value=>paint(C.white,value),g=value=>paint(C.gray,value);
 if(width<58)return[
  `${dr('/////')}${w(' REMOTE RONIN ')}${dr('\\\\\\\\\\')}`,
  `${g('   /_____')}${r('<0>')}${g('_____\\')}`,
  `${g('  /_____/___\\_____\\')}`,
  `${w(' REMOTE / OBSERVE / CONTROL')}`
 ];
 return[
  `${dr('                 .-================-.')}`,
  `${dr('             .-========================-.')}`,
  `${dr('          .-=======---..........---=======-.')}`,
  `${dr('        .======--..                  ..--======.')}`,
  `${dr('       /====--.       ')}${g('.--------.')}${dr('       .--====\\')}`,
  `${dr('      /===--.       ')}${g('/ /######\\ \\')}${dr('       .--===\\')}`,
  `${dr('     |===--        ')}${g('| |########| |')}${dr('        --===|')}`,
  `${dr('     |===--       ')}${g('/############\\')}${dr('       --===|')}`,
  `${dr('     |====--     ')}${g('|####')}${w('  ____  ')}${g('####|')}${dr('     --====|')}`,
  `${dr('     |=====--    ')}${g('|### ')}${w('/ __ \\')}${g(' ###|')}${dr('    --=====|')}`,
  `${dr('     |======--   ')}${g('|## ')}${w('< ')}${r('0  0')}${w(' >')}${g(' ##|')}${dr('   --======|')}`,
  `${dr('      \\======--  ')}${g('|### ')}${w('\\____/')}${g(' ###|')}${dr('  --======/')}`,
  `${dr('       \\======-- ')}${g('\\#####/\\#####/')}${dr(' --======/')}`,
  `${dr('        `-======--')}${g('`----/  \\----`')}${dr('--======-`')}`,
  `${dr('          `-=======--')}${g(' / /\\ \\ ')}${dr('--=======-`')}`,
  `${dr('             `--=====')}${g('/_/  \\_\\')}${dr('=====--`')}`,
  `${r('           //// ')}${w('R E M O T E   R O N I N')}${r(' \\\\\\')}`,
  `${g('              REMOTE / OBSERVE / CONTROL')}`
 ];
}
async function renderBanner(){
 const width=Math.min(process.stdout.columns||80,100),innerWidth=Math.max(38,width-2),line='-'.repeat(innerWidth);
 console.clear();
 console.log(`${C.gold}+${line}+${C.reset}`);
 console.log(`${C.gold}|${C.bold}${'REMOTE RONIN'.padStart((innerWidth+12)/2).padEnd(innerWidth)}${C.reset}${C.gold}|${C.reset}`);
 console.log(`${C.gold}|${C.muted}${'Remote Developer Command Center'.padStart((innerWidth+31)/2).padEnd(innerWidth)}${C.reset}${C.gold}|${C.reset}`);
 console.log(`${C.gold}|${'Built by Aryan Seth'.padStart((innerWidth+19)/2).padEnd(innerWidth)}|${C.reset}`);
 console.log(`${C.gold}+${line}+${C.reset}`);
 const config=await load();
 if(config.showArtwork!==false){console.log('');for(const artLine of adaptivePortrait(width))console.log(centerLine(artLine,width));}
 console.log(`${C.muted}\n TERMINAL  TOOLS  PROJECTS  REMOTE  CHANGES  LOGS  SETTINGS${C.reset}\n`);
}
const ask=(rl,question)=>new Promise(resolve=>rl.question(question,answer=>resolve(answer.trim())));
async function setupWizard(rl){
 console.log(`\n${C.bold}${C.gold}INSTALLATION MENU${C.reset}`);
 console.log(`${C.white}1.${C.reset} Required core + remote access`);
 console.log(`${C.white}2.${C.reset} AI developer tools`);
 console.log(`${C.white}3.${C.reset} Browser verification (Playwright + Chromium)`);
 console.log(`${C.white}4.${C.reset} Everything recommended`);
 console.log(`${C.white}5.${C.reset} Verify only / install nothing`);
 console.log(`${C.white}0.${C.reset} Cancel`);
 const choice=await ask(rl,`${C.gold}Select [0-5]: ${C.reset}`); const selections={'1':'required','2':'ai','3':'browser','4':'recommended'}; const selection=selections[choice];
 if(choice==='5'){print(await execute(['doctor']));return;} if(!selection){console.log(`${C.muted}Setup cancelled. No system changes were made.${C.reset}`);return;}
 const names={required:'Node.js/npm, Git, and Chrome Remote Desktop setup',ai:'Codex, Claude Code, and OpenCode setup',browser:'Playwright and Chromium in this repository',recommended:'all core, remote, editor, AI, and browser components'};
 console.log(`${C.yellow}Selected: ${names[selection]}.${C.reset}`);
 const approved=(await ask(rl,`${C.yellow}Install now? This may download software and request Windows approval. [y/N]: ${C.reset}`)).toLowerCase();
 if(!['y','yes'].includes(approved)){console.log(`${C.muted}Installation cancelled. No system changes were made.${C.reset}`);return;}
 console.log(`${C.gold}Installing and verifying selected components...${C.reset}`); print(await execute(['setup','install',selection,'--yes']));
}
async function interactive(){await banner();const tools=await detectTools();console.log(`${C.gold}${C.bold}AVAILABLE TOOLS${C.reset}`);for(const t of tools)console.log(`${t.healthy?C.green:C.gray}${t.installed?'●':'○'} ${t.name.padEnd(18)} ${t.installed?t.version:'NOT FOUND'}${C.reset}`);console.log(`\n${C.muted}Real host detection · No simulated data · Type /help${C.reset}\n`);const rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:true,historySize:100});const prompt=()=>rl.question(`${C.green}devremote@aryan:~$ ${C.reset}`,async raw=>{if(raw.trim()==='/exit'||raw.trim()==='exit'){rl.close();return;}if(raw.trim()==='/clear'||raw.trim()==='clear'){await banner();prompt();return;}try{const result=await execute(parseInput(raw));print(result);if(result.data?.setupWizard)await setupWizard(rl);}catch(e){print(out('PARSE ERROR',[item('ERROR',e.message)],false));}prompt();});rl.on('SIGINT',()=>rl.close());rl.on('close',()=>{console.log(`\n${C.muted}DevRemote session closed.${C.reset}`);});prompt();}
async function modernInteractive(){
 await renderBanner();
 const tools=await detectTools();
 console.log(`${C.gold}${C.bold}AVAILABLE TOOLS${C.reset}`);
 for(const tool of tools)console.log(`${tool.healthy?C.green:C.gray}${tool.installed?'[+]':'[-]'} ${tool.name.padEnd(18)} ${tool.installed?tool.version:'NOT FOUND'}${C.reset}`);
 console.log(`\n${C.muted}Real host detection / No simulated data / Type /help${C.reset}\n`);
 const rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:true,historySize:100});
 const prompt=()=>rl.question(`${C.green}ronin@aryan:~$ ${C.reset}`,async raw=>{
  if(raw.trim()==='/exit'||raw.trim()==='exit'){rl.close();return;}
  if(raw.trim()==='/clear'||raw.trim()==='clear'){await renderBanner();prompt();return;}
  try{const result=await execute(parseInput(raw));print(result);if(result.data?.setupWizard)await setupWizard(rl);}catch(error){print(out('PARSE ERROR',[item('ERROR',error.message)],false));}
  prompt();
 });
 rl.on('SIGINT',()=>rl.close());
 rl.on('close',()=>{console.log(`\n${C.muted}RemoteRonin session closed.${C.reset}`);});
 prompt();
}
async function main(){const args=process.argv.slice(2);if(args.includes('--version')||args[0]==='version'){console.log('0.1.0');return;}if(args[0]==='--help'){print(await execute(['help']));return;}if(args.length){const result=await execute(args);print(result);if(!result.ok)process.exitCode=1;}else await modernInteractive();}
if(import.meta.url===pathToFileURL(process.argv[1]).href)await main();

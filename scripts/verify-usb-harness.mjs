/** Real USB regression. UI path explored with ARTEMIS trace 2b995a7f-4b15-4f1d-856a-fd01e483da2e. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const serial = process.argv[2];
if (!serial) throw new Error('Pass the explicitly selected USB serial');
const adb = (...args) => execFileSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { date: new Date().toISOString(), serial, exploration: '2b995a7f-4b15-4f1d-856a-fd01e483da2e', trials: [], failures: [] };
const recreate = process.argv.includes('--recreate');
const out = 'docs/harness-review/usb-harness-' + (recreate ? 'recreation' : 'regression') + '.json';
let torchMayBeOn = false;
function save() { fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
function nodes() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/delta-hook-verification.xml');
  const xml = adb('exec-out', 'cat', '/sdcard/delta-hook-verification.xml');
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]])));
}
function tap(node) {
  const values = node?.bounds?.match(/\d+/g)?.map(Number);
  if (!values || values.length !== 4) throw new Error('Missing verified UI bounds');
  adb('shell', 'input', 'tap', String(Math.round((values[0]+values[2])/2)), String(Math.round((values[1]+values[3])/2)));
}
function find(list, label) { return list.find(n => n.text === label || n['content-desc'] === label); }
function logs(pid) { return adb('logcat', '-d', '--pid='+pid, '-v', 'epoch', 'PixelKit:D', 'ReactNativeJS:I', 'TextToSpeech:V', '*:S'); }
function relevant(text) { return text.split('\n').filter(line => /DeltaTorch|useSpeech|TextToSpeech|thermalHeadroom sampled|healthHeadroom|sysfs unavailable/.test(line)).join('\n'); }
async function waitFor(check, timeout=15000) {
  const started=performance.now();
  do { const result=check(); if(result) return result; await pause(300); } while(performance.now()-started<timeout);
  throw new Error('Timed out waiting for verified app state');
}
async function command(enabled, phase) {
  const pid=adb('shell','pidof','com.pixelkit.sdk').trim();
  const before=logs(pid).split('\n').filter(x=>/DeltaTorch.*setAndVerify/.test(x)).at(-1);
  const ui=nodes();
  if (!find(ui,'NANO')) throw new Error('Console NANO must be visible before actuation');
  const editor=ui.find(n=>n.class==='android.widget.EditText');
  tap(editor);
  torchMayBeOn = enabled || torchMayBeOn;
  adb('shell','input','text', enabled?'turn%son%sthe%storch':'turn%soff%sthe%storch');
  const keyboard=nodes();
  const send=find(keyboard,'Send');
  if(send) tap(send);
  else {
    // Verified keyboard Send fallback from ARTEMIS step3, normalized to actual display size.
    const size=adb('shell','wm','size').match(/Physical size: (\d+)x(\d+)/);
    if(!size) throw new Error('Unknown physical display size');
    adb('shell','input','tap',String(Math.round(Number(size[1])*.920)),String(Math.round(Number(size[2])*.905)));
  }
  const event=await waitFor(()=>{
    const event=logs(pid).split('\n').filter(x=>/DeltaTorch.*setAndVerify/.test(x)).at(-1);
    return event && event!==before ? event : null;
  });
  if(!event.includes('"enabled":'+enabled) || /failed/.test(event)) throw new Error('Native torch verification failed: '+event);
  torchMayBeOn = enabled;
  const match=event.match(/\{"enabled".*\}/);
  const measurement=match?JSON.parse(match[0]):null;
  const expected=enabled?'Flashlight turned on.':'Flashlight turned off.';
  await waitFor(()=>nodes().some(n=>n.text===expected));
  const after=logs(pid);
  const eventTime=Number(event.trim().split(/\s+/)[0]);
  const speech=await waitFor(()=>logs(pid).split('\n').find(line=>Number(line.trim().split(/\s+/)[0])>=eventTime && /useSpeech.*spoken/.test(line)));
  report.trials.push({ phase, enabled, pid, nativeVerified:true, uiReply:expected, nativeVerificationMs:measurement?.ms, speechCompletionEvent:speech.trim() });
  fs.appendFileSync('docs/harness-review/usb-harness-native.log',relevant(after)+'\n');
  save(); console.log(JSON.stringify(report.trials.at(-1)));
}
try {
  if (recreate) {
    report.pidBeforeRecreation = adb('shell','pidof','com.pixelkit.sdk').trim();
    report.activityRecreation = adb('shell','am','start','-W','-f','0x10008000','-a','android.intent.action.VIEW','-d','exp+pixelkit://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081','com.pixelkit.sdk');
  }
  await waitFor(()=>{
    const ui=nodes();
    if (find(ui,'Development Build') && find(ui,'Delta')) tap(find(ui,'Delta'));
    const close=find(ui,'Close'); if(close) tap(close);
    const reload=find(ui,'Reload'); if(reload) tap(reload);
    return find(ui,'NANO');
  },45000);
  for(let pair=1;pair<=(recreate?1:3);pair++) { await command(true,'pair'+pair); await command(false,'pair'+pair); }
  if (!recreate) {
    for(let cycle=1;cycle<=3;cycle++) { tap(find(nodes(),'Telemetry')); await pause(500); tap(find(nodes(),'Console')); await pause(500); }
    await command(true,'after-tab-cycles'); await command(false,'after-tab-cycles');
  }
  report.completed=true;
} catch(error) {
  report.failures.push(error.message); process.exitCode=1; console.error(error.message);
} finally {
  if (torchMayBeOn) {
    try { await command(false,'failure-cleanup'); }
    catch (error) { report.failures.push('Cleanup: '+error.message); }
  }
  const pid=adb('shell','pidof','com.pixelkit.sdk').trim();
  fs.writeFileSync('docs/harness-review/usb-harness-native-final.log',relevant(logs(pid))+'\n');
  save();
}

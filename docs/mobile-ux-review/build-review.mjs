import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Documentation builder only. No application/runtime imports or network access.
const root = path.dirname(fileURLToPath(import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const tokens = JSON.parse(read('design-tokens.json'));
const sections = ['conversations', 'agent', 'connections', 'activity', 'settings', 'guide'];
const families = { conversations: ['01', '02'], agent: ['03', '04'], connections: ['05', '06'], activity: ['07', '08'], settings: ['09', '10'], guide: ['08'] };
const boardTitles = ['Conversations and navigation', 'Voice, media and confirmation', 'Agent identity, memory and skills', 'Knowledge, tools and prompts', 'Connections: local and external', 'Connections: providers and availability', 'Activity and diagnostics', 'Help and recovery', 'Preferences: assistant and voice', 'Preferences: audio, safety and recovery'];
// Board frame codes are local artwork labels; stable IDs below belong to the specs.
const panels = [
  ['C02','C01','C14','C02','C12','C15'],
  ['C04','C03','C07','C09','C08','C06'],
  ['A01','A02','A03','A04','A06','A07'],
  ['A08','A09','A09','A11','N13','A12'],
  ['N01','N02','N03','N04','N05','N06'],
  ['N07','N08','N09','N10','N11','N12'],
  ['T01','T02','T03','T03.1','T04','T05'],
  ['T08','G00','G02','G03','G06','C16'],
  ['S00','S01','S01.1','S02','S04','S04.1'],
  ['S05','S06','S07','S10','S10','S10.2']
];
const pages = [];
for (const area of sections) {
  const source = read(`specs/${area}.md`);
  for (const match of source.matchAll(/^#{2,4}\s+([CANTSG]\d{2}(?:\.\d+)?)\s*(?:—|:)\s*(.+)$/gm)) {
    const [,id,title] = match;
    if (pages.some(p => p.id === id)) throw new Error(`Duplicate page ${id}`);
    const frames = panels.flatMap((ids, index) => ids.flatMap((page, frame) => page === id ? [{ board: String(index + 1).padStart(2, '0'), frame: frame + 1 }] : []));
    pages.push({ id, title: title.trim(), area, spec: `specs/${area}.md`, heading: match[0].replace(/^#+\s*/, ''), frames, boardFamily: families[area], coverage: frames.length ? 'illustrated concept frame; see corrections' : 'written specification; board family supplies shared visual pattern', implementation: 'see source-specific implementation status and limitations in spec', deviceVerification: 'not verified for proposed redesign' });
  }
}
for (const page of pages) {
  if (page.id === 'S04') {
    page.implementation = 'Delta 1.0.67 voice output and acoustic enrollment implemented; see spec and evidence';
    page.deviceVerification = 'Pixel enrollment and wake-to-recognizer handoff observed; repeat-trigger reliability failed';
  } else if (page.id === 'S04.1') {
    page.implementation = 'native microphone/model availability and recheck implemented';
    page.deviceVerification = 'unavailable-state failure branch not device-verified';
  }
}
for (const ids of panels) for (const id of ids) if (!pages.some(p => p.id === id)) throw new Error(`Frame references unknown page ${id}`);
const generated = JSON.parse(read('generation-manifest.json'));
const boards = boardTitles.map((title, i) => {
  const id = String(i + 1).padStart(2, '0');
  const file = `boards/board-${id}.png`;
  const data = fs.readFileSync(path.join(root, file));
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG ${file}`);
  return { id, title, file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), width: data.readUInt32BE(16), height: data.readUInt32BE(20), frames: panels[i].map((page, frame) => ({frame: frame + 1, page})), provenance: generated.find(item => item.id === id) ?? null };
});
if (boards.some(b => !b.provenance)) throw new Error('Missing generation provenance');
write('sitemap.json', JSON.stringify({ status: 'design catalog; includes aliases, overlays and states, not a production route registry', navigationContract: 'NAVIGATION.md', submenuReview: 'SUBMENU-REVIEW.md', pages, boards }, null, 2) + '\n');
write('SITEMAP.md', `# Sitemap and page coverage\n\n${pages.length} specified destinations/states; ${boards.length} saved boards with 60 illustrative frames. Pages without their own frame use the linked family pattern and detailed written spec; they do not have a dedicated high-fidelity mockup yet. Image labels are local; this index uses stable spec IDs.\n\n~~~mermaid\nflowchart TD\n  Chat[Active conversation] --> Hub[Full-screen conversation hub]\n  Hub --> Channels[Channels and sessions]\n  Channels --> Chat\n  Hub --> Agent\n  Hub --> Connections\n  Hub --> Activity\n  Hub --> Settings\n  Hub --> Help[Help and reference]\n  Chat --> Composer[Keyboard-safe composer]\n~~~\n\n` + sections.map(area => `## ${area}\n\n| ID | Page/state | Spec | Board coverage |\n| --- | --- | --- | --- |\n` + pages.filter(p=>p.area===area).map(p=>`| ${p.id} | ${p.title} | [spec](${p.spec}) | ${p.frames.length ? p.frames.map(f=>`[${f.board}, frame ${f.frame}](boards/board-${f.board}.png)`).join('; ') : `Written spec + family ${p.boardFamily.join('/')} pattern`} |`).join('\n')).join('\n\n') + '\n\nSee [legacy disposition](LEGACY.md), [foundation](FOUNDATION.md), and [board corrections](REVIEW_NOTES.md).\n');
const styles = `:root{color-scheme:dark;--bg:${tokens.color.background};--surface:${tokens.color.surface};--fg:${tokens.color.text};--muted:${tokens.color.textSecondary}}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,sans-serif}header,main,footer{max-width:1400px;margin:auto;padding:24px}h1{font-size:32px;margin:0}h2{font-size:24px}p{max-width:85ch;color:var(--muted)}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:var(--fg)}button,input,select{font:inherit;color:var(--fg);background:var(--surface);border:1px solid #666;border-radius:10px;min-height:48px;padding:10px 16px}button{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid ${tokens.color.focus};outline-offset:3px}.boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,480px),1fr));gap:24px}.board{background:var(--surface);padding:16px;border-radius:16px}.board img{width:100%;display:block}.board a{display:block}.board p{font-size:14px}.toolbar{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}input{flex:1;min-width:200px}.pages{display:grid;gap:8px}.page{padding:16px;background:var(--surface);border-radius:12px}small{color:var(--muted)}details{margin-top:24px}summary{cursor:pointer;padding:12px;min-height:48px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 ui-monospace,monospace;background:var(--surface);padding:20px;border-radius:12px}.warning{border-left:3px solid ${tokens.color.warning};padding:12px 16px;background:var(--surface)}[hidden]{display:none!important}`;
write('index.html', `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Delta mobile design review</title><style>${styles}</style><header><h1>Delta / Mobile design review</h1><p>Conversation-first. Neutral surfaces. Full-screen navigation. Desktop Delta orb identity.</p><nav><a href="#boards">Boards</a><a href="#pages">Page index</a><a href="#foundation">Engineering foundation</a><a href="#corrections">Review corrections</a><a href="SITEMAP.md">Sitemap</a></nav><p class="warning">Design proposals and sample content—not application screenshots. Read the corrections and implementation evidence for current source and device status.</p></header><main><section id="boards"><h2>Ten saved reference boards</h2><p>Select an image to inspect the full PNG. Each board has six frames, read left to right. Frame labels in artwork differ from stable spec IDs.</p><div class="boards">${boards.map(b=>`<article class="board"><h3>${b.id} / ${escape(b.title)}</h3><a href="${b.file}"><img loading="lazy" src="${b.file}" alt="Delta proposed ${escape(b.title)}: six mobile screen concepts" width="${b.width}" height="${b.height}" style="height:auto"></a><p>${b.frames.map(f=>`Frame ${f.frame}: <a style="display:inline" href="#page-${f.page}">${f.page}</a>`).join(' · ')}</p></article>`).join('')}</div></section><section id="pages"><h2>${pages.length} page and state specifications</h2><p>Dedicated frame coverage is distinguished from a written spec using a shared visual pattern. Aliases and overlays are included; these are not ${pages.length} independent production routes.</p><div class="toolbar"><input id="search" type="search" aria-label="Search page specifications" placeholder="Find a page, state or ID"><select id="area" aria-label="Filter by area"><option value="">All areas</option>${sections.map(s=>`<option>${s}</option>`).join('')}</select></div><p id="count" aria-live="polite"></p><div class="pages">${pages.map(p=>`<article class="page" id="page-${p.id}" data-area="${p.area}" data-search="${escape((p.id+' '+p.title+' '+p.area).toLowerCase())}"><strong>${p.id} / ${escape(p.title)}</strong><br><a href="#spec-${p.area}">Read ${p.area} spec</a> · ${p.frames.length?p.frames.map(f=>`<a href="boards/board-${f.board}.png">Board ${f.board}, frame ${f.frame}</a>`).join(' · '):`Shared board family ${p.boardFamily.join('/')} pattern`}<br><small>${escape(p.coverage)}</small></article>`).join('')}</div></section><section id="foundation"><h2>Engineering foundation</h2><pre>${escape(read('FOUNDATION.md'))}</pre><details><summary>Proposed design tokens</summary><pre>${escape(read('design-tokens.json'))}</pre></details></section><section id="corrections"><h2>Review corrections and evidence</h2><pre>${escape(read('REVIEW_NOTES.md'))}</pre></section>${sections.map(area=>`<section id="spec-${area}"><details><summary>${escape(area)} / full specification</summary><pre>${escape(read(`specs/${area}.md`))}</pre></details></section>`).join('')}<section><h2>Legacy disposition</h2><pre>${escape(read('LEGACY.md'))}</pre></section></main><footer><p>Rebuild: node docs/mobile-ux-review/build-review.mjs · Source status and PNG hashes: sitemap.json</p></footer><script>const search=document.querySelector('#search'),area=document.querySelector('#area'),rows=[...document.querySelectorAll('.page')];function filter(){let visible=0;for(const row of rows){row.hidden=!(row.dataset.search.includes(search.value.toLowerCase())&&(!area.value||row.dataset.area===area.value));if(!row.hidden)visible++}document.querySelector('#count').textContent=visible+' specifications shown'}search.addEventListener('input',filter);area.addEventListener('change',filter);filter();function reveal(){const target=document.getElementById(location.hash.slice(1));if(target){const details=target.querySelector('details');if(details)details.open=true;if(target.classList.contains('page')){search.value='';area.value='';filter()}}}window.addEventListener('hashchange',reveal);reveal();</script></html>`);
for (const filename of ['index.html', 'README.md', 'SITEMAP.md', 'FOUNDATION.md', 'LEGACY.md', 'REVIEW_NOTES.md', ...sections.map(s=>`specs/${s}.md`)]) {
  if (read(filename).includes('\uFFFD')) throw new Error(`Invalid replacement character in ${filename}`);
}
console.log(`Validated ${pages.length} unique page/state IDs, ${boards.length} PNG signatures/provenance records and 60 frame mappings. Built offline gallery and sitemap.`);

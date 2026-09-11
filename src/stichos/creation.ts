import { generateLifeCandidate, type LifeCustomization, type LifeCandidate } from './life-origin';
import { drawPortrait } from './portrait';
import { drawHumanoid } from './art';
import { planetAt, type Geography } from './universe';
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function creationHtml(seed: number, room?: string) {
  return `<div class="v-window-heading"><div><small>${esc(planetAt(seed).name)}${room ? ` · Room ${esc(room)}` : ''}</small><h2>A life is waiting.</h2></div><button id="v-create-back" aria-label="Back to worlds">×</button></div><p class="v-lede">Your mind arrives in a person already living here. Their work, home and belongings become your responsibility.</p><div class="v-creator"><div class="v-body-stage"><canvas id="v-body-preview" width="240" height="260" aria-label="Full character preview"></canvas><div class="v-facing"><button data-facing="3" aria-label="Face west">←</button><button data-facing="0" aria-label="Face north">↑</button><button data-facing="2" aria-label="Face south">↓</button><button data-facing="1" aria-label="Face east">→</button></div><button id="v-reroll">Find another life</button></div><section class="v-life-facts" id="v-life-facts"></section><form id="v-customize" class="v-customize"><label>Name<input id="v-create-name" maxlength="60"></label><div class="v-colors">${['skin', 'hair', 'coat', 'trim'].map((k) => `<label>${k[0].toUpperCase() + k.slice(1)}<input type="color" data-color="${k}" aria-label="${k} color"></label>`).join('')}</div><label>Hair<select id="v-create-hair">${['Short', 'Swept', 'Long', 'Braided', 'Cropped'].map((s, i) => `<option value="${i}">${s}</option>`).join('')}</select></label><label>Headwear<select id="v-create-hat">${['None', 'Cap', 'Hood', 'Winter hood', 'Cowl'].map((s, i) => `<option value="${i}">${s}</option>`).join('')}</select></label><label>Build<input id="v-create-build" type="range" min="0.8" max="1.2" step="0.05"></label><label class="v-check"><input id="v-create-cloak" type="checkbox"> Wear a cloak</label></form></div><div class="v-window-footer"><span id="v-create-note">You may reroll until you accept this life.</span><button id="v-accept-life" class="s-primary">Begin mind transfer</button></div>`;
}
export function mountCreation(
  container: HTMLElement,
  seed: number,
  generation: Geography,
  index: number,
  onAccept: (index: number, customization: LifeCustomization) => void,
  resolve?: (index: number, edit: LifeCustomization) => LifeCandidate,
) {
  let edit: LifeCustomization = {},
    heading = 2,
    frame = 0,
    disposed = false;
  const generate = () =>
    resolve ? resolve(index, edit) : generateLifeCandidate(seed, index, edit, generation);
  let candidate = generate();
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    container.querySelector<T>(`#${id}`)!;
  function refresh(reset = false) {
    candidate = generate();
    get('v-life-facts').innerHTML =
      `<canvas id="v-create-portrait" width="96" height="112"></canvas><h3>${esc(candidate.name)}</h3><p>${candidate.age} years · ${esc(candidate.profession)}</p><dl><div><dt>Home</dt><dd>${esc(candidate.home.name)}</dd></div><div><dt>When you arrive</dt><dd>${esc(candidate.activity.label)}</dd></div><div><dt>Vitality / pace</dt><dd>${candidate.stats.maxHp} / ${candidate.stats.speed.toFixed(1)}</dd></div><div><dt>Owned coin</dt><dd>${candidate.coins}</dd></div><div><dt>Tools</dt><dd>${candidate.tools.join(', ')}</dd></div></dl><p class="v-perk">${esc(candidate.perk)}</p>`;
    drawPortrait(
      get<HTMLCanvasElement>('v-create-portrait').getContext('2d')!,
      candidate.appearance,
    );
    if (reset) {
      get<HTMLInputElement>('v-create-name').value = candidate.name;
      get<HTMLSelectElement>('v-create-hair').value = String(candidate.appearance.hairStyle);
      get<HTMLSelectElement>('v-create-hat').value = String(candidate.appearance.hat);
      get<HTMLInputElement>('v-create-build').value = String(candidate.appearance.build);
      get<HTMLInputElement>('v-create-cloak').checked = candidate.appearance.cloak;
      container
        .querySelectorAll<HTMLInputElement>('[data-color]')
        .forEach(
          (n) =>
            (n.value = candidate.appearance[n.dataset.color as 'skin' | 'hair' | 'coat' | 'trim']),
        );
    }
  }
  const draw = (now: number) => {
    if (disposed) return;
    const c = get<HTMLCanvasElement>('v-body-preview'),
      ctx = c.getContext('2d')!;
    ctx.fillStyle = '#11232e';
    ctx.fillRect(0, 0, 240, 260);
    ctx.fillStyle = '#344a53';
    for (let i = 0; i < 8; i++) ctx.fillRect(35 + i * 23, 214 + (i % 2) * 4, 20, 3);
    drawHumanoid(
      ctx,
      candidate.appearance,
      120,
      217,
      4,
      heading,
      now / 240,
      !matchMedia('(prefers-reduced-motion: reduce)').matches,
      0,
      true,
    );
    frame = requestAnimationFrame(draw);
  };
  refresh(true);
  frame = requestAnimationFrame(draw);
  get('v-reroll').onclick = () => {
    index = (index + 1) % 1000001;
    edit = {};
    refresh(true);
  };
  container
    .querySelectorAll<HTMLElement>('[data-facing]')
    .forEach((n) => (n.onclick = () => (heading = Number(n.dataset.facing))));
  get<HTMLFormElement>('v-customize').onsubmit = (e) => e.preventDefault();
  get<HTMLInputElement>('v-create-name').onchange = (e) => {
    const value = (e.target as HTMLInputElement).value.trim();
    if (value) edit.name = value;
    else delete edit.name;
    refresh();
  };
  container.querySelectorAll<HTMLInputElement>('[data-color]').forEach(
    (n) =>
      (n.oninput = () => {
        edit[n.dataset.color as 'skin' | 'hair' | 'coat' | 'trim'] = n.value;
        refresh();
      }),
  );
  get<HTMLSelectElement>('v-create-hair').onchange = (e) => {
    edit.hairStyle = Number((e.target as HTMLSelectElement).value);
    refresh();
  };
  get<HTMLSelectElement>('v-create-hat').onchange = (e) => {
    edit.hat = Number((e.target as HTMLSelectElement).value);
    refresh();
  };
  get<HTMLInputElement>('v-create-build').oninput = (e) => {
    edit.build = Number((e.target as HTMLInputElement).value);
    refresh();
  };
  get<HTMLInputElement>('v-create-cloak').onchange = (e) => {
    edit.cloak = (e.target as HTMLInputElement).checked;
    refresh();
  };
  get('v-accept-life').onclick = () => onAccept(index, { ...edit });
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
  };
}

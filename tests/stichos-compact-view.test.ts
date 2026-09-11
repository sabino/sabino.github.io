import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteWorld } from '../src/stichos/world.ts';
import {
  buildCompact,
  createCompact,
  applyCompact,
  recordCompactEvent,
} from '../src/stichos/compact.ts';
import { renderCompact } from '../src/stichos/compact-view.ts';

test('the task view keeps unheard testimony private and gates policy/delivery buttons on real work and physical supplies', () => {
  const plan = buildCompact(new InfiniteWorld(3886)),
    p = plan.projects[0];
  let state = createCompact();
  let html = renderCompact(state, plan, {}, 0);
  assert.equal(html.includes(p.witnesses[0].statement!), false);
  assert.match(html, /data-compact-survey="origin-engineer"/);
  assert.match(html, /data-compact-choose="common" disabled/);
  assert.equal(html.includes('data-compact-deliver'), false);
  const inventory = { wood: 100, ore: 100, bandage: 100, cequin: 100 };
  for (const w of p.witnesses)
    state = applyCompact(
      state,
      { kind: 'survey', witnessId: w.id },
      { plan, position: w, actor: w, coins: 1000, inventory },
    ).state;
  html = renderCompact(state, plan, inventory, 1000);
  assert.match(html, /data-compact-choose="common" >Agree/);
  assert.ok(html.includes(p.witnesses[0].statement!));
  state = applyCompact(
    state,
    { kind: 'choose', choiceId: 'common' },
    { plan, position: p.board, actor: p.board, coins: 1000, inventory },
  ).state;
  html = renderCompact(state, plan, inventory, 1000);
  assert.match(
    html,
    /data-compact-deliver disabled/,
    'Existing supplies cannot substitute for the fresh-work stage.',
  );
  const choice = p.choices[0];
  state = recordCompactEvent(
    state,
    {
      id: 'performed:1',
      kind: 'gather',
      item: choice.work.item,
      amount: choice.work.amount,
      propId: 'real-work-fixture',
    },
    plan,
  );
  assert.match(renderCompact(state, plan, inventory, 1000), /data-compact-deliver >Deliver/);
  assert.match(
    renderCompact(state, plan, {}, 1000),
    /data-compact-deliver disabled/,
    'The current body must still carry the physical delivery.',
  );
});

test('generated names, witness statements and track IDs are escaped as text and attributes', () => {
  const plan = buildCompact(new InfiniteWorld(1));
  const malicious = '\"><img src=x onerror=alert(1)>';
  plan.projects[0].witnesses[0].id = malicious;
  plan.projects[0].witnesses[0].name = malicious;
  plan.projects[0].witnesses[0].statement = malicious;
  plan.projects[0].description = malicious;
  plan.projects[0].town.name = malicious;
  const state = createCompact();
  state.surveys = [malicious];
  const html = renderCompact(state, plan, {}, 0);
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('data-compact-track="&quot;&gt;&lt;img'));
});

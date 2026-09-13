import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANNOUNCEMENTS_STORAGE_KEY,
  announcementReadKey,
  createAnnouncementInbox,
  readAnnouncementState,
  validateAnnouncements,
  type AnnouncementEntry,
} from '../src/announcements.ts';
import { RELEASE_NOTES } from '../src/announcements-data.ts';
import { validateBuildMetadata } from '../src/build-metadata.ts';

const entry: AnnouncementEntry = {
  id: 'a-real-change',
  version: '0.1.0',
  date: '2026-09-12',
  title: 'A world to return to',
  status: 'development',
  changes: [{ category: 'New', description: 'Read the latest bulletin.' }],
  evidence: [],
};
const build = {
  version: '0.1.0',
  revision: 'e6063ea9a074e34e9c0baa45ec115016fe384fa0',
  sourceDate: '2026-09-12',
  modified: false,
};
function memoryStorage(initial = '') {
  let value = initial;
  return {
    getItem: (key: string) => (key === ANNOUNCEMENTS_STORAGE_KEY ? value : null),
    setItem: (key: string, next: string) => {
      assert.equal(key, ANNOUNCEMENTS_STORAGE_KEY);
      value = next;
    },
  };
}

test('source release records validate without silent omissions or duplicate IDs', () => {
  assert.deepEqual(validateAnnouncements(RELEASE_NOTES), RELEASE_NOTES);
  assert.equal(new Set(RELEASE_NOTES.map((release) => release.id)).size, RELEASE_NOTES.length);
  assert.equal(RELEASE_NOTES[0].status, 'released', 'The approved batch is ready for publication');
  assert.ok(RELEASE_NOTES[0].evidence.includes('d78b4a6'));
  assert.ok(
    RELEASE_NOTES.filter((release) => release.status === 'released').every(
      (release) => release.evidence.length > 0,
    ),
  );
});

test('new entries are unread until opening, then quiet across browser reloads', () => {
  const storage = memoryStorage();
  const inbox = createAnnouncementInbox({ storage, entries: [entry], build });
  assert.equal(inbox.unreadCount, 1);
  assert.match(inbox.buttonLabel(), /1 unread entry/);
  inbox.markRead();
  assert.equal(inbox.unreadCount, 0);
  assert.doesNotMatch(inbox.buttonLabel(), /v-news-dot|unread/);
  assert.equal(createAnnouncementInbox({ storage, entries: [entry], build }).unreadCount, 0);
});

test('upgrades expose only the new entry and rebuilding alone never nags', () => {
  const storage = memoryStorage();
  createAnnouncementInbox({ storage, entries: [entry], build }).markRead();
  const differentBuild = { ...build, revision: '408b1b0' };
  assert.equal(
    createAnnouncementInbox({ storage, entries: [entry], build: differentBuild }).unreadCount,
    0,
  );
  const next = { ...entry, id: 'another-change', title: 'More paths' };
  assert.equal(
    createAnnouncementInbox({ storage, entries: [next, entry], build: differentBuild }).unreadCount,
    1,
  );
});

test('corrected release content becomes unread, evidence-only edits remain quiet', () => {
  const storage = memoryStorage();
  createAnnouncementInbox({ storage, entries: [entry] }).markRead();
  assert.equal(
    createAnnouncementInbox({ storage, entries: [{ ...entry, title: 'Corrected announcement' }] })
      .unreadCount,
    1,
  );
  assert.equal(
    createAnnouncementInbox({ storage, entries: [{ ...entry, evidence: ['e6063ea'] }] })
      .unreadCount,
    0,
  );
});

test('marking read changes only the separate bounded bulletin state', () => {
  const old = Array.from({ length: 256 }, (_, i) => `old-${i}:12345678`);
  const storage = memoryStorage(JSON.stringify({ schema: 1, read: old }));
  createAnnouncementInbox({ storage, entries: [entry] }).markRead();
  const state = readAnnouncementState(storage);
  assert.equal(state.size, 256);
  assert.ok(state.has(announcementReadKey(entry)));
  assert.equal(state.has(old[0]), false);
});

test('malformed or oversized local state is discarded safely', () => {
  for (const value of ['{oops', 'null', '[]', '{"schema":2,"read":[]}', 'a'.repeat(32769)]) {
    assert.equal(
      createAnnouncementInbox({ storage: memoryStorage(value), entries: [entry] }).unreadCount,
      1,
    );
  }
  const mixed = memoryStorage(
    JSON.stringify({ schema: 1, read: [17, null, {}, 'invalid', 'good-id:12345678'] }),
  );
  assert.deepEqual([...readAnnouncementState(mixed)], ['good-id:12345678']);
});

test('privacy-restricted and quota-full storage stays quiet in the current session', () => {
  const inbox = createAnnouncementInbox({
    storage: {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('quota');
      },
    },
    entries: [entry],
  });
  assert.equal(inbox.unreadCount, 1);
  assert.doesNotThrow(() => inbox.markRead());
  assert.equal(inbox.unreadCount, 0);
  assert.doesNotThrow(() => createAnnouncementInbox({ storage: null }).html());
});

test('invalid record shapes, categories, dates and duplicate IDs are rejected', () => {
  const invalid = [
    null,
    3,
    {},
    { ...entry, id: '../bad' },
    { ...entry, date: '2026-02-30' },
    { ...entry, title: '' },
    { ...entry, status: 'claimed' },
    { ...entry, changes: [] },
    { ...entry, changes: [{ category: 'Hype', description: 'No.' }] },
    { ...entry, changes: [{ category: 'New', description: 'x'.repeat(481) }] },
  ];
  assert.deepEqual(validateAnnouncements(invalid), []);
  assert.deepEqual(validateAnnouncements([entry, entry]), [entry]);
  assert.deepEqual(validateAnnouncements('bad'), []);
  assert.equal(
    validateAnnouncements(Array.from({ length: 1000 }, (_, i) => ({ ...entry, id: `id-${i}` })))
      .length,
    64,
  );
});

test('HTML and unsafe artwork can never become executable announcement content', () => {
  const unsafe = {
    ...entry,
    title: '<img src=x onerror="bad()">',
    version: '<script>alert(1)</script>',
    changes: [{ category: 'New', description: '<svg onload="evil()"> & text' }],
    artwork: { src: 'https://external.example/image.png', alt: 'external' },
  };
  const html = createAnnouncementInbox({ storage: null, entries: [unsafe], build }).html();
  assert.doesNotMatch(html, /<img|<svg|<script/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;svg/);
  assert.match(html, /&amp; text/);
  assert.doesNotMatch(html, /external\.example/);
  for (const src of [
    '../release-art/a.png',
    './release-art/../a.png',
    '//example/a.png',
    'javascript:alert(1)',
    './release-art/a.png?bad',
  ]) {
    assert.equal(
      validateAnnouncements([{ ...entry, artwork: { src, alt: 'Image' } }])[0]?.artwork,
      undefined,
    );
  }
});

test('optional project artwork preserves alt text and local-only loading', () => {
  const withArt = {
    ...entry,
    artwork: { src: './release-art/bulletin.webp', alt: 'A traveler’s illustrated map' },
  };
  const html = createAnnouncementInbox({ storage: null, entries: [withArt], build }).html();
  assert.match(html, /src="\.\/release-art\/bulletin.webp"/);
  assert.match(html, /alt="A traveler’s illustrated map"/);
  assert.match(html, /loading="lazy"/);
});

test('panel uses native keyboard disclosure controls, named return and polite read status', () => {
  const inbox = createAnnouncementInbox({
    storage: null,
    entries: [entry, { ...entry, id: 'older', status: 'released' }],
    build,
  });
  const html = inbox.html();
  assert.match(html, /<h2>What’s new in Verso<\/h2>/);
  assert.equal((html.match(/<details /g) ?? []).length, 2);
  assert.equal((html.match(/<summary>/g) ?? []).length, 2);
  assert.equal((html.match(/ open>/g) ?? []).length, 1);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<button type="button" id="v-news-return">Return<\/button>/);
  assert.match(inbox.buttonLabel(), /aria-hidden="true"/);
  assert.match(inbox.buttonLabel(), /2 unread entries/);
  assert.doesNotMatch(html, /tabindex="-?\d+"|on(click|keydown)=/);
});

test('mount marks all shown records read and disposal removes only its own handler', () => {
  const inbox = createAnnouncementInbox({ storage: memoryStorage(), entries: [entry], build });
  let click: (() => void) | undefined;
  let closed = 0;
  let updated = 0;
  let removed = 0;
  const status = { textContent: '' };
  const button = {
    addEventListener(type: string, handler: () => void) {
      assert.equal(type, 'click');
      click = handler;
    },
    removeEventListener(type: string, handler: () => void) {
      assert.equal(type, 'click');
      assert.equal(click, handler);
      click = undefined;
    },
  };
  const container = {
    querySelector(selector: string) {
      return selector === '#v-news-return' ? button : status;
    },
    querySelectorAll() {
      return [
        {
          remove() {
            removed++;
          },
        },
      ];
    },
  } as unknown as HTMLElement;
  const dispose = inbox.mount(container, { onClose: () => closed++, onRead: () => updated++ });
  assert.equal(inbox.unreadCount, 0);
  assert.equal(updated, 1);
  assert.equal(removed, 1);
  assert.match(status.textContent, /up to date/);
  click?.();
  assert.equal(closed, 1);
  dispose();
  assert.equal(click, undefined);
});

test('a missing panel does not falsely mark entries read', () => {
  const inbox = createAnnouncementInbox({ storage: memoryStorage(), entries: [entry], build });
  inbox.mount(
    {
      querySelector() {
        return null;
      },
    } as unknown as HTMLElement,
    {
      onClose() {
        assert.fail('not mounted');
      },
    },
  )();
  assert.equal(inbox.unreadCount, 1);
});

test('running source identity is embedded, escaped and independent of deployment fetches', () => {
  const html = createAnnouncementInbox({
    storage: null,
    entries: [entry],
    build: { ...build, modified: true },
  }).html();
  assert.match(html, /0.1.0 · e6063ea9a074 \+ local changes/);
  assert.match(html, /In this local build/);
  assert.doesNotMatch(html, /fetch\(|https?:\/\//);
  assert.equal(validateBuildMetadata({ ...build, revision: '<script>' }).revision, 'unversioned');
  assert.equal(validateBuildMetadata(undefined).version, '0.1.0');
});

test('opening an older window preserves read records written by a newer window', () => {
  const storage = memoryStorage();
  const older = createAnnouncementInbox({ storage, entries: [entry] });
  const added = { ...entry, id: 'newer-announcement' };
  createAnnouncementInbox({ storage, entries: [added, entry] }).markRead();
  older.markRead();
  assert.equal(createAnnouncementInbox({ storage, entries: [added, entry] }).unreadCount, 0);
});

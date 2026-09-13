import { BUILD_METADATA, type BuildMetadata } from './build-metadata.ts';
import { RELEASE_NOTES } from './announcements-data.ts';

export type AnnouncementCategory = 'New' | 'Improved' | 'Fixed';
export interface AnnouncementEntry {
  id: string;
  version: string;
  date: string;
  title: string;
  status: 'development' | 'released';
  changes: readonly { category: AnnouncementCategory; description: string }[];
  evidence: readonly string[];
  artwork?: { src: string; alt: string };
}
export interface AnnouncementStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const ANNOUNCEMENTS_STORAGE_KEY = 'verso.announcements.read.v1';
const MAX_ENTRIES = 64;
const MAX_READ = 256;
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Invalid entries never break the title screen, and strings are always rendered as text. */
export function validateAnnouncements(input: unknown): AnnouncementEntry[] {
  if (!Array.isArray(input)) return [];
  const entries: AnnouncementEntry[] = [];
  const seen = new Set<string>();
  for (const value of input.slice(0, MAX_ENTRIES)) {
    if (
      !record(value) ||
      !text(value.id, 80) ||
      !/^[a-z0-9-]+$/.test(value.id) ||
      seen.has(value.id)
    )
      continue;
    if (
      !text(value.version, 80) ||
      !text(value.title, 140) ||
      typeof value.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
    )
      continue;
    const parsed = new Date(value.date);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.date)
      continue;
    if (value.status !== 'development' && value.status !== 'released') continue;
    if (!Array.isArray(value.changes) || value.changes.length < 1 || value.changes.length > 12)
      continue;
    if (
      !value.changes.every(
        (change) =>
          record(change) &&
          ['New', 'Improved', 'Fixed'].includes(String(change.category)) &&
          text(change.description, 480),
      )
    )
      continue;
    const evidence = Array.isArray(value.evidence)
      ? value.evidence
          .filter((ref): ref is string => typeof ref === 'string' && /^[a-f0-9]{7,40}$/.test(ref))
          .slice(0, 16)
      : [];
    const artwork =
      record(value.artwork) &&
      typeof value.artwork.src === 'string' &&
      /^\.\/release-art\/[a-z0-9-]+\.(?:png|webp|svg)$/.test(value.artwork.src) &&
      text(value.artwork.alt, 200)
        ? { src: value.artwork.src, alt: value.artwork.alt }
        : undefined;
    entries.push({
      id: value.id,
      version: value.version,
      title: value.title,
      date: value.date,
      status: value.status,
      changes: value.changes.map((change) => ({
        category: change.category,
        description: change.description,
      })),
      evidence,
      ...(artwork ? { artwork } : {}),
    });
    seen.add(value.id);
  }
  return entries;
}

/** Content-based identity: a rebuild is quiet; a changed announcement becomes unread. */
export function announcementReadKey(entry: AnnouncementEntry): string {
  const value = JSON.stringify([
    entry.id,
    entry.version,
    entry.date,
    entry.title,
    entry.status,
    entry.changes,
    entry.artwork ?? null,
  ]);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
  return `${entry.id}:${hash.toString(16).padStart(8, '0')}`;
}

function browserStorage(): AnnouncementStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
export function readAnnouncementState(storage?: AnnouncementStorage): Set<string> {
  try {
    const raw = storage?.getItem(ANNOUNCEMENTS_STORAGE_KEY);
    if (!raw || raw.length > 32768) return new Set();
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.schema !== 1 || !Array.isArray(value.read)) return new Set();
    return new Set(
      value.read
        .filter(
          (v): v is string => typeof v === 'string' && /^[a-z0-9-]{1,80}:[a-f0-9]{8}$/.test(v),
        )
        .slice(-MAX_READ),
    );
  } catch {
    return new Set();
  }
}

export function createAnnouncementInbox(
  options: {
    storage?: AnnouncementStorage | null;
    entries?: unknown;
    build?: BuildMetadata;
  } = {},
) {
  const storage = options.storage === null ? undefined : (options.storage ?? browserStorage());
  const entries = validateAnnouncements(options.entries ?? RELEASE_NOTES);
  const build = options.build ?? BUILD_METADATA;
  let read = readAnnouncementState(storage);
  const unread = () => entries.filter((entry) => !read.has(announcementReadKey(entry)));
  const buildLabel = () =>
    `${build.version} · ${build.revision.slice(0, 12)}${build.modified ? ' + local changes' : ''}`;

  function markRead() {
    read = new Set(
      [...readAnnouncementState(storage), ...read, ...entries.map(announcementReadKey)].slice(
        -MAX_READ,
      ),
    );
    try {
      storage?.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify({ schema: 1, read: [...read] }));
    } catch {
      /* Keep the session quiet when storage is unavailable. */
    }
  }
  function buttonLabel(label = 'What’s new') {
    const count = unread().length;
    return `<span>${escape(label)}</span>${count ? `<span class="v-news-dot" aria-hidden="true"></span><span class="v-news-sr">, ${count} unread ${count === 1 ? 'entry' : 'entries'}</span>` : ''}`;
  }
  function entryHtml(entry: AnnouncementEntry, index: number) {
    const isUnread = !read.has(announcementReadKey(entry));
    const heading = `<span class="v-news-entry-meta"><time datetime="${entry.date}">${escape(new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(entry.date)))}</time><span>${entry.status === 'development' ? 'In this local build' : 'Released'}</span>${isUnread ? '<span class="v-news-new">Unread</span>' : ''}</span><span class="v-news-entry-title">${escape(entry.title)}</span>`;
    return `<details class="v-news-entry"${index === 0 ? ' open' : ''}><summary>${heading}</summary><div class="v-news-entry-body"><p class="v-news-version">${escape(entry.status === 'development' ? buildLabel() : entry.version)}</p>${entry.artwork ? `<img class="v-news-art" src="${escape(entry.artwork.src)}" alt="${escape(entry.artwork.alt)}" loading="lazy" decoding="async"/>` : ''}<ul>${entry.changes.map((change) => `<li><span class="v-news-category" data-category="${change.category.toLowerCase()}">${change.category}</span><p>${escape(change.description)}</p></li>`).join('')}</ul></div></details>`;
  }
  function html() {
    return `<h2>What’s new in Verso</h2><div class="v-news"><div class="v-news-intro"><span class="v-news-kicker">The traveler’s bulletin</span><p>New paths, better tools, a world worth returning to.</p><p class="v-news-installed">This build <code>${escape(buildLabel())}</code></p></div><p class="v-news-read-status" role="status" aria-live="polite">${unread().length ? `${unread().length} unread entries. Opening this bulletin marks them as read on this browser.` : 'You’re up to date with this bundle.'}</p><div class="v-news-entries">${entries.length ? entries.map(entryHtml).join('') : '<p>No release notes are available in this bundle.</p>'}</div><p class="v-news-footnote">Saved with the game for offline reading. Opening this bulletin does not change your life, world or room.</p></div><button type="button" id="v-news-return">Return</button>`;
  }
  function mount(container: HTMLElement, handlers: { onClose: () => void; onRead?: () => void }) {
    const close = container.querySelector<HTMLButtonElement>('#v-news-return');
    if (!close) return () => {};
    markRead();
    const status = container.querySelector<HTMLElement>('.v-news-read-status');
    if (status)
      status.textContent =
        'You’re up to date with this bundle. Read status is saved on this browser when storage is available.';
    container.querySelectorAll('.v-news-new').forEach((node) => node.remove());
    handlers.onRead?.();
    close.addEventListener('click', handlers.onClose);
    return () => close.removeEventListener('click', handlers.onClose);
  }
  return {
    entries,
    get unreadCount() {
      return unread().length;
    },
    markRead,
    buttonLabel,
    html,
    mount,
  };
}

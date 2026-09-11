/** A browser identity has one active tab. Separate browser profiles have separate lives. */
let release: (() => void) | null = null;
let held = false;
export async function claimLifeTab(): Promise<boolean> {
  if (held) return true;
  if (!navigator.locks) return true;
  return new Promise((resolve) => {
    void navigator.locks
      .request('verso.continuing-life.v1', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        held = true;
        const lifetime = new Promise<void>((done) => (release = done));
        resolve(true);
        await lifetime;
        held = false;
      })
      .catch(() => resolve(false));
  });
}
export function releaseLifeTab() {
  release?.();
  release = null;
  held = false;
}

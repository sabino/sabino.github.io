import type { TravelFeedback } from './navigation.ts';

export function mountTravelUi(
  root: HTMLElement,
  actions: {
    lock(run: boolean): void;
    stop(): void;
    home(): void;
  },
) {
  const pane = document.createElement('div');
  pane.className = 'v-travel-controls';
  pane.innerHTML = `<div class="v-travel-buttons" role="group" aria-label="Hands-free travel"><button type="button" data-travel="lock" aria-label="Lock walking in your current direction">Walk lock</button><button type="button" data-travel="run" aria-label="Lock running in your current direction">Run lock</button><button type="button" data-travel="home">Go home</button><button type="button" data-travel="stop" hidden>Stop</button></div><output class="v-travel-status" aria-live="polite" aria-atomic="true"></output>`;
  root.querySelector('.s-world-wrap')!.append(pane);
  const buttons = (name: string) =>
    pane.querySelector<HTMLButtonElement>(`[data-travel="${name}"]`)!;
  buttons('lock').onclick = () => actions.lock(false);
  buttons('run').onclick = () => actions.lock(true);
  buttons('home').onclick = actions.home;
  buttons('stop').onclick = actions.stop;
  const output = pane.querySelector('output')!;
  let previous = '';
  return {
    update(feedback: TravelFeedback, available: boolean, hasHome: boolean) {
      pane.hidden = !available;
      const active = ['locked', 'planning', 'walking', 'door'].includes(feedback.state);
      buttons('stop').hidden = !active;
      buttons('lock').hidden = buttons('run').hidden = buttons('home').hidden = active;
      buttons('home').disabled = !hasHome;
      const text =
        feedback.state === 'idle'
          ? ''
          : feedback.state === 'locked'
            ? feedback.label
            : feedback.state === 'unreachable'
              ? (feedback.reason ?? 'No permitted route.')
              : `${feedback.label} · ${feedback.state === 'planning' ? 'finding a route' : feedback.state === 'arrived' ? 'arrived' : feedback.state === 'door' ? 'waiting at the door' : `${feedback.remaining} tiles remaining`}`;
      if (text !== previous) {
        output.textContent = text;
        previous = text;
      }
      pane.dataset.active = String(active);
    },
  };
}

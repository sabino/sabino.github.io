(() => {
  const MAX_LABEL_LENGTH = 120;

  const cleanText = (value = '') => value.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);

  const destinationFor = (link) => {
    if (!link) return undefined;
    try {
      const destination = new URL(link.href, location.href);
      if (destination.origin === location.origin) return `${destination.pathname}${destination.hash}`;
      return `${destination.hostname}${destination.pathname}`;
    } catch {
      return undefined;
    }
  };

  const sectionFor = (element) => {
    const section = element.closest('section[id]');
    if (section) return section.id;
    if (element.closest('[data-header]')) return 'header';
    if (element.closest('.site-footer')) return 'footer';
    return 'page';
  };

  const contextFor = (element) => {
    const container = element.closest('.project-card, .journal-card, article');
    return cleanText(container?.querySelector('h2, h3, h4')?.textContent || '');
  };

  const eventFor = (element, link) => {
    if (element.matches('[data-menu-button]')) return 'navigation-menu';
    if (element.matches('[data-language-link]')) return 'language-switch';
    if (element.matches('[data-submit]')) return 'contact-submit-click';
    if (link?.hash === '#contact') return 'contact-cta';
    if (element.closest('.project-card')) return 'project-link';
    if (element.closest('.journal-card')) return 'journal-link';
    if (element.matches('.contact-social')) return 'social-link';
    if (element.closest('[data-nav]')) return 'navigation';
    if (element.closest('.footer-links')) return 'footer-link';
    if (link && link.origin !== location.origin) return 'outbound-link';
    if (element.matches('.button')) return 'cta-click';
    return element instanceof HTMLButtonElement ? 'button-click' : 'link-click';
  };

  const track = (eventName, data = {}) => {
    if (typeof window.umami?.track !== 'function') return false;
    try {
      window.umami.track(eventName, {
        locale: document.documentElement.lang || 'en',
        ...data,
      });
      return true;
    } catch {
      return false;
    }
  };

  window.sabinoAnalytics = Object.freeze({ track });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const element = event.target.closest('a[href], button');
    if (!element || element.closest('[data-umami-event]')) return;

    const link = element instanceof HTMLAnchorElement ? element : null;
    const context = contextFor(element);
    const data = {
      section: sectionFor(element),
      label: cleanText(element.getAttribute('aria-label') || element.textContent || ''),
    };
    const destination = destinationFor(link);
    if (destination) data.destination = destination;
    if (context) data.context = context;
    if (element.matches('[data-menu-button]')) {
      data.action = element.getAttribute('aria-expanded') === 'true' ? 'close' : 'open';
    }

    track(eventFor(element, link), data);
  }, { capture: true });
})();

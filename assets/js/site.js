(() => {
  const header = document.querySelector('[data-header]');
  const menuButton = document.querySelector('[data-menu-button]');
  const nav = document.querySelector('[data-nav]');
  const yearTargets = document.querySelectorAll('[data-year]');
  const openMenuLabel = menuButton?.getAttribute('aria-label') || 'Open navigation';

  yearTargets.forEach((target) => {
    target.textContent = new Date().getFullYear();
  });

  const updateHeader = () => {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 18);
  };

  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });

  const closeMenu = () => {
    if (!header || !menuButton) return;
    header.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', openMenuLabel);
    document.body.style.removeProperty('overflow');
  };

  if (header && menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const isOpen = header.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
      menuButton.setAttribute('aria-label', isOpen ? menuButton.dataset.closeLabel : openMenuLabel);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) closeMenu();
    });
  }

  document.querySelectorAll('[data-reveal]').forEach((target) => {
    target.classList.add('is-visible');
  });
})();

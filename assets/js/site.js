(() => {
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const pageCache = new Map();
  const cleanupTasks = [];
  let revealObserver;
  let navigationObserver;
  let swapInFlight = false;
  let turnstileScriptPromise;

  const isPortuguese = () => document.documentElement.lang.toLowerCase().startsWith('pt');
  const localHostnames = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const trackEvent = (eventName, data = {}) => window.sabinoAnalytics?.track(eventName, data);

  const addCleanup = (task) => cleanupTasks.push(task);

  const cleanupDynamicPage = () => {
    revealObserver?.disconnect();
    navigationObserver?.disconnect();
    while (cleanupTasks.length) cleanupTasks.pop()?.();
  };

  const setMenuState = (isOpen, { restoreFocus = false, focusFirst = false } = {}) => {
    const header = document.querySelector('[data-header]');
    const button = document.querySelector('[data-menu-button]');
    const nav = document.querySelector('[data-nav]');
    if (!header || !button || !nav) return;
    const mobile = window.innerWidth <= 1050;
    const expanded = mobile && isOpen;
    header.classList.toggle('is-open', expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', expanded ? button.dataset.closeLabel : button.dataset.openLabel);
    document.body.style.overflow = expanded ? 'hidden' : '';
    if (mobile && !expanded) {
      nav.setAttribute('inert', '');
      nav.setAttribute('aria-hidden', 'true');
    } else {
      nav.removeAttribute('inert');
      nav.removeAttribute('aria-hidden');
    }
    if (expanded && focusFirst) requestAnimationFrame(() => nav.querySelector('a')?.focus());
    if (!expanded && restoreFocus) button.focus();
  };

  const closeMenu = (options) => setMenuState(false, options);

  const updateViewportState = () => {
    const header = document.querySelector('[data-header]');
    header?.classList.toggle('is-scrolled', window.scrollY > 18);

    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    document.documentElement.style.setProperty('--scroll-progress', progress.toFixed(4));
  };

  const splitKineticText = (element) => {
    if (element.dataset.kineticReady === 'true') return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    let index = 0;
    textNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.append(document.createTextNode(part));
          return;
        }
        const word = document.createElement('span');
        word.className = 'kinetic-word';
        word.style.setProperty('--word-index', index);
        word.textContent = part;
        fragment.append(word);
        index += 1;
      });
      node.replaceWith(fragment);
    });
    element.dataset.kineticReady = 'true';
  };

  const setupReveals = () => {
    const targets = [...document.querySelectorAll('[data-reveal]')];
    if (motionQuery.matches || !('IntersectionObserver' in window)) {
      targets.forEach((target) => target.classList.add('is-visible'));
      return;
    }

    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        entry.target.classList.remove('reveal-pending');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    targets.forEach((target, index) => {
      if (target.closest('.hero, .journal-hero')) {
        target.classList.remove('reveal-pending');
        target.classList.add('is-visible');
        return;
      }
      target.classList.remove('is-visible');
      target.classList.add('reveal-pending');
      target.style.transitionDelay = `${Math.min(index % 4, 3) * 55}ms`;
      revealObserver.observe(target);
    });
  };

  const setupCounters = () => {
    const counters = [...document.querySelectorAll('[data-count]')];
    if (!counters.length) return;

    if (motionQuery.matches || !('IntersectionObserver' in window)) {
      counters.forEach((counter) => {
        counter.textContent = `${counter.dataset.count}${counter.dataset.suffix || ''}`;
      });
      return;
    }

    const animationFrames = new Set();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.target.dataset.counted === 'true') return;
        const target = entry.target;
        const finalValue = Number(target.dataset.count);
        const suffix = target.dataset.suffix || '';
        const startedAt = performance.now();
        target.dataset.counted = 'true';

        const tick = (now) => {
          const progress = Math.min(1, (now - startedAt) / 1050);
          const eased = 1 - Math.pow(1 - progress, 4);
          target.textContent = `${Math.round(finalValue * eased)}${suffix}`;
          if (progress < 1) {
            const frame = requestAnimationFrame(tick);
            animationFrames.add(frame);
          }
        };
        const frame = requestAnimationFrame(tick);
        animationFrames.add(frame);
        observer.unobserve(target);
      });
    }, { threshold: 0.45 });

    counters.forEach((counter) => observer.observe(counter));
    addCleanup(() => {
      observer.disconnect();
      animationFrames.forEach(cancelAnimationFrame);
    });
  };

  const setupActiveNavigation = () => {
    const sections = [...document.querySelectorAll('main section[id]')];
    if (!sections.length || !('IntersectionObserver' in window)) return;

    navigationObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      document.querySelectorAll('.site-nav a[href^="#"]').forEach((link) => {
        if (link.getAttribute('href') === `#${visible.target.id}`) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-22% 0px -62% 0px', threshold: [0, 0.15, 0.6] });

    sections.forEach((section) => navigationObserver.observe(section));
  };

  class PipelineScene {
    constructor(canvas) {
      this.staticCanvas = canvas;
      this.staticContext = canvas.getContext('2d', { alpha: true });
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'pipeline-canvas pipeline-packets';
      this.canvas.setAttribute('aria-hidden', 'true');
      canvas.after(this.canvas);
      this.context = this.canvas.getContext('2d', { alpha: true });
      this.frame = 0;
      this.running = false;
      this.visible = true;
      this.time = 0;
      this.lastDraw = 0;
      this.frameInterval = 1000 / 24;
      this.nodes = [
        { x: 0.10, y: 0.34, type: 'source', label: 'input' },
        { x: 0.28, y: 0.57, type: 'bot', label: 'agent_01' },
        { x: 0.45, y: 0.22, type: 'harness', label: 'harness' },
        { x: 0.56, y: 0.73, type: 'queue', label: 'queue' },
        { x: 0.63, y: 0.46, type: 'bot', label: 'agent_02' },
        { x: 0.80, y: 0.27, type: 'store', label: 'state' },
        { x: 0.89, y: 0.61, type: 'target', label: 'prod' },
      ];
      this.edges = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5], [4, 6], [5, 6]];
      this.packets = this.edges.flatMap((_, edge) => [0, 1].map((packet) => ({
        edge,
        phase: (edge * 0.173 + packet * 0.49) % 1,
        speed: 0.055 + ((edge + packet) % 4) * 0.012,
        color: (edge + packet) % 3 === 0 ? '#d8ff4f' : '#5de4e7',
      })));
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.staticCanvas);
      this.visibilityObserver = new IntersectionObserver(([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) this.start();
        else this.stop();
      }, { rootMargin: '180px' });
      this.visibilityObserver.observe(this.staticCanvas);
      this.onVisibility = () => document.hidden ? this.stop() : this.start();
      document.addEventListener('visibilitychange', this.onVisibility);
      this.resize();
      this.draw(0);
      if (!motionQuery.matches) this.start();
    }

    resize() {
      const rect = this.staticCanvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.staticCanvas.width = Math.round(this.width * ratio);
      this.staticCanvas.height = Math.round(this.height * ratio);
      this.canvas.width = Math.round(this.width * ratio);
      this.canvas.height = Math.round(this.height * ratio);
      this.staticContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.drawStatic();
      this.draw(this.time);
    }

    point(node) {
      return { x: node.x * this.width, y: node.y * this.height };
    }

    curve(edgeIndex) {
      const [fromIndex, toIndex] = this.edges[edgeIndex];
      const from = this.point(this.nodes[fromIndex]);
      const to = this.point(this.nodes[toIndex]);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const bend = (edgeIndex % 2 ? -1 : 1) * Math.min(28, Math.hypot(dx, dy) * 0.13);
      const length = Math.max(1, Math.hypot(dx, dy));
      return {
        from,
        to,
        control: {
          x: (from.x + to.x) / 2 - (dy / length) * bend,
          y: (from.y + to.y) / 2 + (dx / length) * bend,
        },
      };
    }

    curvePoint(curve, progress) {
      const inverse = 1 - progress;
      return {
        x: inverse * inverse * curve.from.x + 2 * inverse * progress * curve.control.x + progress * progress * curve.to.x,
        y: inverse * inverse * curve.from.y + 2 * inverse * progress * curve.control.y + progress * progress * curve.to.y,
      };
    }

    drawNode(ctx, node, index, time) {
      const point = this.point(node);
      const active = (time * 0.00022 + index * 0.17) % 1;
      const pulse = Math.sin(active * Math.PI * 2) * 0.5 + 0.5;
      const size = node.type === 'bot' ? 15 : 12;

      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.strokeStyle = node.type === 'bot' ? 'rgba(216,255,79,.82)' : 'rgba(93,228,231,.66)';
      ctx.fillStyle = 'rgba(5,9,7,.82)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 9 + pulse * 8;
      ctx.shadowColor = node.type === 'bot' ? 'rgba(216,255,79,.45)' : 'rgba(93,228,231,.32)';

      if (node.type === 'bot') {
        ctx.strokeRect(-size, -size * 0.68, size * 2, size * 1.36);
        ctx.fillRect(-size, -size * 0.68, size * 2, size * 1.36);
        ctx.beginPath();
        ctx.moveTo(0, -size * 0.68);
        ctx.lineTo(0, -size * 1.05);
        ctx.lineTo(4, -size * 1.22);
        ctx.stroke();
        ctx.fillStyle = '#d8ff4f';
        ctx.fillRect(-6, -2, 3, 3);
        ctx.fillRect(3, -2, 3, 3);
      } else if (node.type === 'harness') {
        ctx.rotate(Math.PI / 4);
        ctx.strokeRect(-size * 0.72, -size * 0.72, size * 1.44, size * 1.44);
        ctx.fillRect(-size * 0.72, -size * 0.72, size * 1.44, size * 1.44);
        ctx.rotate(-Math.PI / 4);
      } else {
        ctx.beginPath();
        ctx.rect(-size, -size * 0.62, size * 2, size * 1.24);
        ctx.fill();
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(231,241,235,.72)';
      ctx.font = '9px "SFMono-Regular", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, 0, size + 14);
      ctx.restore();
    }

    drawStatic() {
      if (!this.staticContext || !this.width || !this.height) return;
      const ctx = this.staticContext;
      ctx.clearRect(0, 0, this.width, this.height);
      this.edges.forEach((_, index) => {
        const curve = this.curve(index);
        const gradient = ctx.createLinearGradient(curve.from.x, curve.from.y, curve.to.x, curve.to.y);
        gradient.addColorStop(0, 'rgba(93,228,231,.12)');
        gradient.addColorStop(0.6, 'rgba(216,255,79,.24)');
        gradient.addColorStop(1, 'rgba(93,228,231,.08)');
        ctx.beginPath();
        ctx.moveTo(curve.from.x, curve.from.y);
        ctx.quadraticCurveTo(curve.control.x, curve.control.y, curve.to.x, curve.to.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      this.nodes.forEach((node, index) => this.drawNode(ctx, node, index, 0));
    }

    draw(time) {
      if (!this.context || !this.width || !this.height) return;
      this.time = time;
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);

      this.packets.forEach((packet) => {
        const progress = (packet.phase + time * 0.0001 * packet.speed * 16) % 1;
        const point = this.curvePoint(this.curve(packet.edge), progress);
        ctx.beginPath();
        ctx.arc(point.x, point.y, packet.color === '#d8ff4f' ? 2.3 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = packet.color;
        ctx.shadowBlur = 13;
        ctx.shadowColor = packet.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    loop = (time) => {
      if (time - this.lastDraw >= this.frameInterval) {
        this.draw(time);
        this.lastDraw = time;
      }
      if (this.running) this.frame = requestAnimationFrame(this.loop);
    };

    start() {
      if (this.running || motionQuery.matches || !this.visible || document.hidden) return;
      this.running = true;
      this.frame = requestAnimationFrame(this.loop);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.frame);
    }

    destroy() {
      this.stop();
      this.resizeObserver.disconnect();
      this.visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.canvas.remove();
    }
  }

  const setupPipeline = () => {
    const canvas = document.querySelector('[data-pipeline-canvas]');
    if (!canvas || !('ResizeObserver' in window)) return;
    let scene;
    let idleId;
    let timerId;
    let disposed = false;
    const start = () => {
      if (!disposed && canvas.isConnected) scene = new PipelineScene(canvas);
    };
    if ('requestIdleCallback' in window) idleId = requestIdleCallback(start, { timeout: 450 });
    else timerId = window.setTimeout(start, 90);
    addCleanup(() => {
      disposed = true;
      if (idleId !== undefined) cancelIdleCallback(idleId);
      if (timerId !== undefined) clearTimeout(timerId);
      scene?.destroy();
    });
  };

  const setupTerminal = () => {
    const terminal = document.querySelector('[data-terminal]');
    if (!terminal) return;
    const clock = terminal.querySelector('[data-terminal-clock]');
    const log = terminal.querySelector('[data-terminal-log]');
    const steps = [...terminal.querySelectorAll('[data-terminal-steps] li')];
    const portuguese = isPortuguese();
    const logs = portuguese
      ? ['contexto indexado', 'pipeline verificado', 'agente retornou patch', 'testes verdes', 'handoff registrado']
      : ['context indexed', 'pipeline edge verified', 'agent returned patch', 'tests green', 'handoff artifact written'];
    const labels = portuguese
      ? { done: 'feito', running: 'exec', waiting: 'fila' }
      : { done: 'done', running: 'run', waiting: 'wait' };
    let activeStep = 1;
    let activeLog = 0;

    const updateClock = () => {
      if (clock) clock.textContent = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date());
    };
    const updateSteps = () => {
      steps.forEach((step, index) => {
        step.classList.toggle('is-done', index < activeStep);
        step.classList.toggle('is-running', index === activeStep);
        const status = step.querySelector('.ok');
        if (status) status.textContent = index < activeStep ? labels.done : index === activeStep ? labels.running : labels.waiting;
      });
      activeStep = (activeStep + 1) % steps.length;
    };
    const updateLog = () => {
      if (log) log.innerHTML = `<span>[ok]</span> ${logs[activeLog]}`;
      activeLog = (activeLog + 1) % logs.length;
    };

    updateClock();
    updateSteps();
    updateLog();
    if (motionQuery.matches) return;
    const clockTimer = window.setInterval(updateClock, 1000);
    const stepTimer = window.setInterval(updateSteps, 1850);
    const logTimer = window.setInterval(updateLog, 2300);
    addCleanup(() => {
      clearInterval(clockTimer);
      clearInterval(stepTimer);
      clearInterval(logTimer);
    });
  };

  const setupMagneticButtons = () => {
    if (motionQuery.matches || !finePointerQuery.matches) return;
    document.querySelectorAll('[data-magnetic]').forEach((button) => {
      const move = (event) => {
        const rect = button.getBoundingClientRect();
        const x = Math.max(-7, Math.min(7, (event.clientX - rect.left - rect.width / 2) * 0.12));
        const y = Math.max(-6, Math.min(6, (event.clientY - rect.top - rect.height / 2) * 0.12));
        button.style.setProperty('--magnetic-x', `${x}px`);
        button.style.setProperty('--magnetic-y', `${y}px`);
      };
      const reset = () => {
        button.style.setProperty('--magnetic-x', '0px');
        button.style.setProperty('--magnetic-y', '0px');
      };
      button.addEventListener('pointermove', move);
      button.addEventListener('pointerleave', reset);
      addCleanup(() => {
        button.removeEventListener('pointermove', move);
        button.removeEventListener('pointerleave', reset);
      });
    });
  };

  const setupHeroParallax = () => {
    const hero = document.querySelector('.hero');
    const art = hero?.querySelector('.hero-art');
    if (!hero || !art || motionQuery.matches || !finePointerQuery.matches) return;
    let frame = 0;
    const move = (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = hero.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 9;
        art.style.setProperty('--hero-shift-x', `${x.toFixed(2)}px`);
        art.style.setProperty('--hero-shift-y', `${y.toFixed(2)}px`);
      });
    };
    const reset = () => {
      art.style.setProperty('--hero-shift-x', '0px');
      art.style.setProperty('--hero-shift-y', '0px');
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', reset);
    addCleanup(() => {
      cancelAnimationFrame(frame);
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', reset);
    });
  };

  const setupDossiers = () => {
    const tablist = document.querySelector('[data-dossier-tabs]');
    const tabs = [...tablist?.querySelectorAll('[data-dossier-tab]') || []];
    const panels = [...document.querySelectorAll('[data-dossier-panel]')];
    const status = document.querySelector('[data-dossier-status]');
    if (!tablist || !tabs.length || !panels.length) return;

    const activate = (tab, { focus = false, announce = true } = {}) => {
      const panelId = tab.getAttribute('aria-controls');
      tabs.forEach((candidate) => {
        const active = candidate === tab;
        candidate.setAttribute('aria-selected', String(active));
        candidate.setAttribute('tabindex', active ? '0' : '-1');
      });
      panels.forEach((panel) => {
        panel.hidden = panel.id !== panelId;
        panel.classList.toggle('is-active', panel.id === panelId);
      });
      if (focus) tab.focus({ preventScroll: true });
      if (tablist.scrollWidth > tablist.clientWidth) {
        const tabRect = tab.getBoundingClientRect();
        const tablistRect = tablist.getBoundingClientRect();
        const maxScrollLeft = tablist.scrollWidth - tablist.clientWidth;
        const centeredScrollLeft = tablist.scrollLeft
          + tabRect.left - tablistRect.left
          - (tablist.clientWidth - tabRect.width) / 2;
        tablist.scrollTo({
          left: Math.max(0, Math.min(maxScrollLeft, centeredScrollLeft)),
          behavior: motionQuery.matches ? 'auto' : 'smooth',
        });
      }
      if (announce && status) {
        status.textContent = isPortuguese()
          ? `Dossiê ${tab.textContent.trim()} selecionado`
          : `${tab.textContent.trim()} dossier selected`;
      }
      if (announce) trackEvent('dossier-view', { dossier: panelId.replace('dossier-', '') });
    };

    const onClick = (event) => {
      const tab = event.target.closest('[data-dossier-tab]');
      if (tab) activate(tab);
    };
    const onKeydown = (event) => {
      const current = event.target.closest('[data-dossier-tab]');
      if (!current) return;
      const index = tabs.indexOf(current);
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      activate(tabs[nextIndex], { focus: true });
    };

    tablist.addEventListener('click', onClick);
    tablist.addEventListener('keydown', onKeydown);
    activate(tabs.find((tab) => tab.getAttribute('aria-selected') === 'true') || tabs[0], { announce: false });
    addCleanup(() => {
      tablist.removeEventListener('click', onClick);
      tablist.removeEventListener('keydown', onKeydown);
    });
  };

  const setupLabArchive = () => {
    const projects = document.querySelector('[data-lab-projects]');
    const toggle = document.querySelector('[data-lab-toggle]');
    if (!projects || !toggle) return;
    const extras = [...projects.querySelectorAll('[data-lab-extra]')];
    const setExpanded = (expanded) => {
      projects.classList.toggle('is-expanded', expanded);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? toggle.dataset.lessLabel : toggle.dataset.moreLabel;
      extras.forEach((extra) => extra.setAttribute('aria-hidden', String(!expanded)));
    };
    const onClick = () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      setExpanded(expanded);
      trackEvent('lab-archive', { state: expanded ? 'expanded' : 'collapsed' });
    };
    setExpanded(false);
    toggle.addEventListener('click', onClick);
    addCleanup(() => toggle.removeEventListener('click', onClick));
  };

  const loadTurnstileScript = () => {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => reject(new Error('turnstile-script'));
      document.head.append(script);
    });
    return turnstileScriptPromise;
  };

  const setupContactForm = () => {
    const form = document.querySelector('[data-contact-form]');
    if (!form) return;
    const status = form.querySelector('[data-form-status]');
    const submit = form.querySelector('[data-submit]');
    const slot = form.querySelector('[data-turnstile-slot]');
    const recovery = form.querySelector('[data-contact-recovery]');
    const retry = form.querySelector('[data-contact-retry]');
    const linkedin = form.querySelector('[data-contact-linkedin]');
    const portuguese = isPortuguese();
    const copy = portuguese ? {
      loading: 'inicializando a verificação privada…',
      ready: 'verificação concluída · sua mensagem pode ser enviada',
      unavailable: 'o formulário seguro não está disponível agora · tente novamente ou continue pelo LinkedIn',
      verifying: 'conclua a verificação humana para enviar',
      sending: 'enviando com segurança…',
      success: 'contexto recebido · eu mesmo vou ler e responder',
      error: 'não foi possível enviar agora · seus campos foram preservados',
    } : {
      loading: 'initializing the private check…',
      ready: 'verification complete · your message can be sent',
      unavailable: 'the secure form is unavailable right now · retry or continue on LinkedIn',
      verifying: 'complete the human check before sending',
      sending: 'sending securely…',
      success: 'context received · I will read and reply personally',
      error: 'the message could not be sent right now · your fields were preserved',
    };
    const baseEndpoint = localHostnames.has(location.hostname) ? 'http://127.0.0.1:8787' : form.dataset.endpoint;
    let widgetId;
    let token = '';
    let completed = false;
    let disposed = false;
    submit.disabled = true;

    const setStatus = (message, state = '') => {
      status.textContent = message;
      status.classList.toggle('is-success', state === 'success');
      status.classList.toggle('is-error', state === 'error');
    };

    const showRecovery = (visible) => {
      if (recovery) recovery.hidden = !visible;
    };

    const initialize = async () => {
      token = '';
      submit.disabled = true;
      showRecovery(false);
      if (widgetId !== undefined) {
        window.turnstile?.remove(widgetId);
        widgetId = undefined;
      }
      setStatus(copy.loading);
      try {
        const response = await fetch(`${baseEndpoint}/config`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('contact-config');
        const config = await response.json();
        if (!config.siteKey) throw new Error('turnstile-site-key');
        const turnstile = await loadTurnstileScript();
        if (disposed) return;
        slot.replaceChildren();
        widgetId = turnstile.render(slot, {
          sitekey: config.siteKey,
          theme: 'dark',
          size: 'flexible',
          appearance: 'interaction-only',
          action: 'contact',
          callback: (value) => {
            token = value;
            submit.disabled = false;
            showRecovery(false);
            if (!completed) setStatus(copy.ready, 'success');
            trackEvent('contact-verification', { state: 'ready' });
          },
          'expired-callback': () => {
            token = '';
            submit.disabled = true;
            setStatus(copy.verifying);
            trackEvent('contact-verification', { state: 'expired' });
          },
          'error-callback': () => {
            token = '';
            submit.disabled = true;
            setStatus(copy.unavailable, 'error');
            showRecovery(true);
            trackEvent('contact-verification', { state: 'error' });
          },
        });
      } catch {
        if (!disposed) {
          setStatus(copy.unavailable, 'error');
          showRecovery(true);
          trackEvent('contact-form', { state: 'unavailable' });
        }
      }
    };

    const onSubmit = async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) {
        trackEvent('contact-form', { state: 'invalid' });
        return;
      }
      if (!token) {
        setStatus(copy.verifying, 'error');
        trackEvent('contact-form', { state: 'verification-required' });
        return;
      }
      submit.disabled = true;
      setStatus(copy.sending);
      trackEvent('contact-form', { state: 'attempt' });
      const fields = new FormData(form);
      try {
        const response = await fetch(`${baseEndpoint}/contact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name: fields.get('name'),
            email: fields.get('email'),
            message: fields.get('message'),
            website: fields.get('website'),
            language: document.documentElement.lang,
            turnstileToken: token,
          }),
        });
        if (!response.ok) throw new Error('contact-submit');
        form.reset();
        token = '';
        completed = true;
        window.turnstile?.reset(widgetId);
        setStatus(copy.success, 'success');
        showRecovery(false);
        trackEvent('contact-form', { state: 'success' });
      } catch {
        token = '';
        submit.disabled = true;
        window.turnstile?.reset(widgetId);
        setStatus(copy.error, 'error');
        showRecovery(true);
        trackEvent('contact-form', { state: 'error' });
      }
    };

    const onInput = () => {
      if (!completed) return;
      completed = false;
      if (token) setStatus(copy.ready, 'success');
    };

    const onRetry = () => {
      trackEvent('contact-recovery', { action: 'retry' });
      initialize();
    };
    const onLinkedIn = () => trackEvent('contact-recovery', { action: 'linkedin' });

    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', onInput);
    retry?.addEventListener('click', onRetry);
    linkedin?.addEventListener('click', onLinkedIn);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      initialize();
    }, { rootMargin: '320px' });
    observer.observe(form);

    addCleanup(() => {
      disposed = true;
      observer.disconnect();
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('input', onInput);
      retry?.removeEventListener('click', onRetry);
      linkedin?.removeEventListener('click', onLinkedIn);
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    });
  };

  const setupLogoMarquee = () => {
    document.querySelectorAll('[data-logo-marquee]').forEach((marquee) => {
      if (marquee.dataset.logoReady === 'true') return;
      const track = marquee.querySelector('[data-logo-track]');
      const group = track?.querySelector('.logo-marquee__group');
      if (!track || !group) return;

      const duplicate = group.cloneNode(true);
      duplicate.removeAttribute('aria-labelledby');
      duplicate.setAttribute('aria-hidden', 'true');
      duplicate.querySelectorAll('[tabindex]').forEach((item) => item.setAttribute('tabindex', '-1'));
      duplicate.querySelectorAll('img').forEach((image) => image.setAttribute('alt', ''));
      track.append(duplicate);

      const duration = Math.max(48, Math.min(72, group.scrollWidth / 42));
      marquee.style.setProperty('--logo-duration', `${duration.toFixed(1)}s`);
      marquee.dataset.logoReady = 'true';
      marquee.classList.add('is-ready');
    });
  };

  const initializePage = () => {
    document.querySelectorAll('[data-year]').forEach((target) => {
      target.textContent = new Date().getFullYear();
    });
    const menuButton = document.querySelector('[data-menu-button]');
    if (menuButton && !menuButton.dataset.openLabel) menuButton.dataset.openLabel = menuButton.getAttribute('aria-label');
    setMenuState(false);
    document.querySelectorAll('[data-kinetic]').forEach(splitKineticText);
    setupReveals();
    setupCounters();
    setupActiveNavigation();
    setupPipeline();
    setupTerminal();
    setupMagneticButtons();
    setupHeroParallax();
    setupLogoMarquee();
    setupDossiers();
    setupLabArchive();
    setupContactForm();
  };

  const fetchPage = (url) => {
    const key = new URL(url, location.href).pathname;
    if (!pageCache.has(key)) {
      pageCache.set(key, fetch(key, { headers: { Accept: 'text/html' } })
        .then((response) => {
          if (!response.ok) throw new Error(`language-page-${response.status}`);
          return response.text();
        })
        .then((html) => new DOMParser().parseFromString(html, 'text/html'))
        .catch((error) => {
          pageCache.delete(key);
          throw error;
        }));
    }
    return pageCache.get(key);
  };

  const ensureLanguageOverlay = () => {
    let overlay = document.querySelector('[data-language-transition]');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'language-transition';
    overlay.dataset.languageTransition = '';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<div class="language-transition__inner"><span class="language-transition__label">recompiling interface</span><strong class="language-transition__word">br</strong></div>';
    document.body.append(overlay);
    return overlay;
  };

  const pagePosition = () => {
    const threshold = (document.querySelector('[data-header]')?.offsetHeight || 78) + 34;
    const sections = [...document.querySelectorAll('main section[id]')];
    const section = sections.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.top <= threshold && rect.bottom > threshold;
    }) || sections[0];
    return section ? { id: section.id, offset: window.scrollY - section.offsetTop } : { id: 'top', offset: window.scrollY };
  };

  const updateDocumentMetadata = (nextDocument) => {
    document.documentElement.lang = nextDocument.documentElement.lang;
    document.title = nextDocument.title;
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:locale"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
      'link[rel="canonical"]',
    ];
    selectors.forEach((selector) => {
      const current = document.head.querySelector(selector);
      const next = nextDocument.head.querySelector(selector);
      if (current && next) {
        if (current instanceof HTMLMetaElement) current.content = next.content;
        else current.setAttribute('href', next.getAttribute('href'));
      } else if (!current && next) {
        document.head.append(next.cloneNode(true));
      } else if (current && !next && selector.includes('og:locale')) {
        current.remove();
      }
    });
    const currentSchema = document.head.querySelector('script[type="application/ld+json"]');
    const nextSchema = nextDocument.head.querySelector('script[type="application/ld+json"]');
    if (currentSchema && nextSchema) currentSchema.textContent = nextSchema.textContent;
  };

  const switchLanguage = async (url, { push = true, restoreFocus = false } = {}) => {
    if (swapInFlight) return;
    const destination = new URL(url, location.href);
    if (destination.pathname === location.pathname && push) return;
    swapInFlight = true;
    const overlay = ensureLanguageOverlay();
    const word = overlay.querySelector('.language-transition__word');
    const label = overlay.querySelector('.language-transition__label');
    const targetIsPortuguese = destination.pathname.startsWith('/pt');
    word.textContent = targetIsPortuguese ? 'br' : 'en';
    label.textContent = targetIsPortuguese ? 'recompilando interface' : 'recompiling interface';
    const position = pagePosition();

    try {
      const pagePromise = fetchPage(destination);
      document.body.classList.add('language-swap-out');
      document.body.setAttribute('aria-busy', 'true');
      overlay.classList.add('is-active');
      await wait(motionQuery.matches ? 0 : 170);
      const nextDocument = await pagePromise;
      const nextHeader = nextDocument.querySelector('.header-inner');
      const nextMain = nextDocument.querySelector('main');
      const nextFooter = nextDocument.querySelector('.footer-grid');
      if (!nextHeader || !nextMain || !nextFooter) throw new Error('language-page-structure');

      cleanupDynamicPage();
      document.querySelector('.header-inner').innerHTML = nextHeader.innerHTML;
      document.querySelector('main').innerHTML = nextMain.innerHTML;
      document.querySelector('.footer-grid').innerHTML = nextFooter.innerHTML;
      updateDocumentMetadata(nextDocument);
      if (push) history.pushState({ language: document.documentElement.lang }, '', destination.pathname);
      initializePage();

      await new Promise(requestAnimationFrame);
      const restoredSection = document.getElementById(position.id) || document.getElementById('top');
      if (restoredSection) window.scrollTo({ top: Math.max(0, restoredSection.offsetTop + position.offset), behavior: 'auto' });
      document.body.classList.remove('language-swap-out');
      await wait(motionQuery.matches ? 0 : 210);
      overlay.classList.remove('is-active');
      if (restoreFocus) document.querySelector('[data-language-link]')?.focus({ preventScroll: true });
    } catch {
      location.assign(destination.href);
      return;
    } finally {
      document.body.removeAttribute('aria-busy');
      swapInFlight = false;
    }
  };

  document.addEventListener('click', (event) => {
    const languageLink = event.target.closest('[data-language-link]');
    if (languageLink && languageLink.origin === location.origin) {
      event.preventDefault();
      closeMenu();
      switchLanguage(languageLink.href, { restoreFocus: event.detail === 0 });
      return;
    }

    const menuButton = event.target.closest('[data-menu-button]');
    if (menuButton) {
      const header = document.querySelector('[data-header]');
      const isOpen = !header.classList.contains('is-open');
      setMenuState(isOpen, { focusFirst: isOpen && event.detail === 0 });
      return;
    }

    if (event.target.closest('[data-nav] a')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.querySelector('[data-header]')?.classList.contains('is-open')) {
      closeMenu({ restoreFocus: true });
    }
  });
  window.addEventListener('resize', () => {
    setMenuState(document.querySelector('[data-header]')?.classList.contains('is-open'));
    updateViewportState();
  }, { passive: true });
  window.addEventListener('scroll', updateViewportState, { passive: true });
  window.addEventListener('popstate', () => {
    const targetLanguage = location.pathname.startsWith('/pt') ? 'pt' : 'en';
    if (!document.documentElement.lang.toLowerCase().startsWith(targetLanguage)) {
      switchLanguage(location.href, { push: false });
    }
  });

  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  ensureLanguageOverlay();
  initializePage();

  const prefetchAlternateLanguage = () => {
    const link = document.querySelector('[data-language-link]');
    if (link && link.origin === location.origin) fetchPage(link.href).catch(() => {});
  };
  if ('requestIdleCallback' in window) requestIdleCallback(prefetchAlternateLanguage, { timeout: 1800 });
  else window.setTimeout(prefetchAlternateLanguage, 700);
})();

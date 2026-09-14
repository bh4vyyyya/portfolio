/* ==========================================================================
   bhavyyyya — Terminal Prompt Cursor (>_)
   Pure white, crisp monospace, zero gradients.
   ========================================================================== */

(function initTerminalPromptCursor() {
  // Respect touch devices and accessibility reduced-motion
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cursor = document.createElement('div');
  cursor.className = 'terminal-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = '<span class="cursor-content"><span class="cursor-arrow">&gt;</span><span class="cursor-char">_</span></span>';

  document.body.appendChild(cursor);
  document.body.classList.add('custom-cursor-enabled');

  let isVisible = false;

  window.addEventListener('mousemove', (e) => {
    if (!isVisible) {
      isVisible = true;
      cursor.style.opacity = '1';
    }

    // 0-delay exact tracking with tip of '>' at the pointer coordinates
    cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;

    // Detect interactive elements
    if (e.target && e.target.closest('#tv-stage')) {
      return; // Handled by 3D raycaster in tv-arcade.js
    }

    const interactive = e.target && e.target.closest('a, button, .github-btn, .project, .projects, [role="button"]');
    if (interactive) {
      cursor.classList.add('is-hover');
    } else {
      cursor.classList.remove('is-hover');
    }
  }, { passive: true });

  window.addEventListener('mousedown', () => {
    cursor.classList.add('is-active');
  });

  window.addEventListener('mouseup', () => {
    cursor.classList.remove('is-active');
  });

  document.addEventListener('mouseleave', () => {
    isVisible = false;
    cursor.style.opacity = '0';
  });

  document.addEventListener('mouseenter', () => {
    isVisible = true;
    cursor.style.opacity = '1';
  });
})();

/* ==========================================================================
   Terminal Typewriter Effect (Initial Boot Sequence)
   Types out hero & intro text across ~2.5 seconds on page load
   ========================================================================== */
(function initTerminalTypewriter() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const h1 = document.querySelector('#bhavya h1');
  const subtitle = document.querySelector('#bhavya .subtitle');
  const aboutP = document.querySelector('#about p');

  if (!h1 || !subtitle) return;

  // Extract original contents
  const h1Text = h1.textContent.trim();
  const subText = subtitle.textContent.trim();
  const aboutHTML = aboutP ? aboutP.innerHTML.trim() : '';

  // Preserve heights to completely prevent layout shift (CLS)
  const h1Height = h1.offsetHeight;
  if (h1Height) h1.style.minHeight = `${h1Height}px`;

  const subHeight = subtitle.offsetHeight;
  if (subHeight) subtitle.style.minHeight = `${subHeight}px`;

  let aboutHeight = 0;
  if (aboutP) {
    aboutHeight = aboutP.offsetHeight;
    if (aboutHeight) aboutP.style.minHeight = `${aboutHeight}px`;
  }

  // Tokenize about HTML to safely preserve tags (like <br>) during stream
  const aboutTokens = [];
  if (aboutHTML) {
    const regex = /<[^>]+>|[^<]/g;
    let match;
    while ((match = regex.exec(aboutHTML)) !== null) {
      aboutTokens.push(match[0]);
    }
  }

  // Prepare initial empty states with typing indicator classes
  h1.textContent = '';
  h1.classList.add('is-typing');

  subtitle.textContent = '';
  subtitle.classList.add('is-typing');

  if (aboutP) {
    aboutP.innerHTML = '';
    aboutP.classList.add('is-typing');
  }

  let isCompleted = false;

  function completeInstantly() {
    if (isCompleted) return;
    isCompleted = true;
    h1.textContent = h1Text;
    subtitle.textContent = subText;
    if (aboutP) aboutP.innerHTML = aboutHTML;
    cleanup();
  }

  function cleanup() {
    h1.classList.remove('is-typing');
    subtitle.classList.remove('is-typing');
    if (aboutP) aboutP.classList.remove('is-typing');
    h1.style.minHeight = '';
    subtitle.style.minHeight = '';
    if (aboutP) aboutP.style.minHeight = '';
    window.removeEventListener('keydown', completeInstantly);
    window.removeEventListener('click', completeInstantly);
  }

  // Allow immediate skip on user interaction (click / keydown)
  window.addEventListener('keydown', completeInstantly, { once: true });
  window.addEventListener('click', completeInstantly, { once: true });

  const startTime = performance.now();
  const totalDuration = 2600; // ~2.6s total

  // Cascading timeline phases (in milliseconds)
  const h1Start = 60;
  const h1End = 700;
  const subStart = 720;
  const subEnd = 1600;
  const aboutStart = 1620;
  const aboutEnd = 2600;

  function step(now) {
    if (isCompleted) return;
    const elapsed = now - startTime;

    // 1. Type H1 (Bhavya Asoriya)
    if (elapsed >= h1Start) {
      const progress = Math.min(1, (elapsed - h1Start) / (h1End - h1Start));
      const charCount = Math.floor(progress * h1Text.length);
      h1.textContent = h1Text.slice(0, charCount);
      if (progress >= 1) h1.classList.remove('is-typing');
    }

    // 2. Type Subtitle (Computer Engineering Student • Builder • Developer)
    if (elapsed >= subStart) {
      const progress = Math.min(1, (elapsed - subStart) / (subEnd - subStart));
      const charCount = Math.floor(progress * subText.length);
      subtitle.textContent = subText.slice(0, charCount);
      if (progress >= 1) subtitle.classList.remove('is-typing');
    }

    // 3. Type About Paragraph
    if (aboutP && elapsed >= aboutStart) {
      const progress = Math.min(1, (elapsed - aboutStart) / (aboutEnd - aboutStart));
      const tokenCount = Math.floor(progress * aboutTokens.length);
      aboutP.innerHTML = aboutTokens.slice(0, tokenCount).join('');
      if (progress >= 1) aboutP.classList.remove('is-typing');
    }

    if (elapsed < totalDuration) {
      requestAnimationFrame(step);
    } else {
      completeInstantly();
    }
  }

  requestAnimationFrame(step);
})();

const components = {
  '#site-header': 'components/header.html',
  '.hero': 'components/hero.html',
  '.about': 'components/about.html',
  '#site-footer': 'components/footer.html'
};

async function injectComponent(selector, path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    const html = await res.text();
    const el = document.querySelector(selector);
    if (el) el.innerHTML = html;
    else console.warn('Missing element for', selector);
  } catch (err) {
    console.error(err);
  }
}

async function injectAll() {
  const entries = Object.entries(components);
  await Promise.all(entries.map(([sel, p]) => injectComponent(sel, p)));

  // add smooth scroll to injected anchors
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', injectAll);
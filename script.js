// Mobile menu toggle
var btn = document.querySelector('.menu-btn');
var nav = document.getElementById('site-nav');
if (btn && nav) {
  btn.addEventListener('click', function () {
    var open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// Scroll reveal (content stays visible if IntersectionObserver is missing)
var items = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach(function (el, i) {
    el.style.setProperty('--delay', ((i % 4) * 0.08) + 's');
    io.observe(el);
  });
} else {
  items.forEach(function (el) { el.classList.add('in'); });
}

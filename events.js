// Eliksir Foundation: loads events from a published Google Sheet (CSV).
//
// SETUP (once):
//  1. In your Google Sheet: File > Share > Publish to web.
//  2. Choose the events tab and the format "Comma-separated values (.csv)", then Publish.
//  3. Paste the link it gives you between the quotes below.
//
// If a sheet can't be loaded, the matching section is simply left empty.
var EVENTS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrID_td2FVUAUGqR-sYilLCTQ6JO9o2BKedGrPMJG5aeVcjOpgg6kNecc13VwkmpmWMERChwxp2hw-/pub?gid=0&single=true&output=csv";

// Weekly programs live on their own tab of the same sheet. Publish that tab as CSV too
// (File > Share > Publish to web > choose the tab > CSV) and paste its link here.
// Columns: Name, Day, Time, Location, Description   (optional: Link)
// Day and Time are plain text shown as typed, e.g. "Every Wednesday" and "After Isha".
// Link (optional): a sign-up or info page. Leave it blank and no button is shown.
var PROGRAMS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSrID_td2FVUAUGqR-sYilLCTQ6JO9o2BKedGrPMJG5aeVcjOpgg6kNecc13VwkmpmWMERChwxp2hw-/pub?gid=1563272143&single=true&output=csv";

// EVENTS TAB. Sheet columns (row 1 headings; capital letters don't matter). Use any of these:
//   Start Date, End Date, Time, Title, Address, Description, Poster, Zeffy Link
// Start Date / End Date: e.g. 12/18/2026, 2026-12-18 or "December 18, 2026".
//              End Date is optional (leave it blank for a one-day event).
//              (A single "Date" column also works, including "Jan 15 2027 - Jan 17 2027".)
// Times:       put the time inside Start Date / End Date (e.g. 12/18/2026 19:00:00).
//              It is shown on the website only when the event is one day or less.
//              Events spanning more than one day show no time. An optional "Time"
//              column, if you add one, is shown as typed instead.
// Address:     where it happens ("Location" or "Place" also work)
// Description: shown in the event list and in full on the event's own page
// Poster:      a file name in assets/images/ (e.g. iftar.jpg) or a full https:// image link
// Photos:      (optional, for past events) photos from the event, shown at the bottom of
//              the event's page. List as many as you like, separated by a comma,
//              a semicolon or a new line: iftar1.jpg, iftar2.jpg, iftar3.jpg
//              Each is a file name in assets/images/ or a full https:// image link.
// Zeffy Link:  your Zeffy ticket/registration link. Leave it blank and the
//              "Register on Zeffy" button is not shown for that event.

(function () {
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var upcomingEl = document.getElementById('upcoming-list') || document.getElementById('home-upcoming');
  var pastEl = document.getElementById('past-list');
  var detailEl = document.getElementById('event-detail');
  var progEl = document.getElementById('program-list');
  var recentEl = document.getElementById('recent-events');
  var wantsEvents = !!(upcomingEl || pastEl || recentEl || detailEl);
  if (!wantsEvents && !progEl) return;
  if (detailEl && !EVENTS_CSV_URL) showNotFound();

  // ----- CSV parsing (handles quotes, commas and line breaks inside quotes) -----
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], field = '', inQ = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
        } else { field += c; }
      } else if (c === '"') { inQ = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else { field += c; }
    }
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  function parseOne(s) {
    s = (s || '').trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '');   // drop a leading weekday
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+[\d:]+(?:\s*[ap]m)?)?$/i);   // 12/15/2026 or 12/15/2026 0:00:00 (month first)
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    var d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Minutes after midnight from the time part of a cell, or null if there is none.
  function parseMinutes(s) {
    var m = (s || '').match(/(?:^|[\sT])(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?/i);
    if (!m) return null;
    var h = +m[1], min = +m[2], ap = m[3] ? m[3].toLowerCase() : '';
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  function fmtMinutes(t) {
    var h = Math.floor(t / 60), m = t % 60, ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }
  function dayGap(a, b) { return Math.round((b - a) / 86400000); }

  // The time to show for an event, or '' for none.
  function timeText(ev, startMin, endMin) {
    if (ev.time) return ev.time;                      // an explicit Time column wins
    if (dayGap(ev.when, ev.end) > 1) return '';       // more than one day apart: hide the time
    if (startMin === null) return '';
    var allDay = startMin === 0 && (endMin === null || endMin === 0 || endMin >= 23 * 60);
    if (allDay) return '';
    var out = fmtMinutes(startMin);
    if (endMin !== null && endMin !== startMin && endMin !== 0) out += ' \u2013 ' + fmtMinutes(endMin);
    return out;
  }

  // "A" or "A - B" (also en dash, em dash or "to"). Returns {start, end} or null.
  function parseRange(s) {
    var parts = (s || '').split(/\s+(?:-|\u2013|\u2014|to)\s+/i);
    var start = parseOne(parts[0]);
    if (!start) return null;
    var end = parts.length > 1 ? parseOne(parts[1]) : null;
    if (!end || end < start) end = start;
    return { start: start, end: end };
  }

  var LONG = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  function dateText(ev) {
    // Text typed like "Tuesday, December 15, 2026" is shown as typed.
    // Numeric dates (2026-12-15) are written out nicely.
    if (!/^\d/.test(ev.date)) return ev.date;
    var a = ev.when.toLocaleDateString('en-US', LONG);
    return ev.end > ev.when ? a + ' \u2013 ' + ev.end.toLocaleDateString('en-US', LONG) : a;
  }
  function dayLabel(ev) {   // "15" or "15\u201318"
    var d = String(ev.when.getDate()).padStart(2, '0');
    if (ev.end > ev.when && ev.end.getMonth() === ev.when.getMonth() && ev.end.getFullYear() === ev.when.getFullYear()) {
      return d + '\u2013' + String(ev.end.getDate()).padStart(2, '0');
    }
    return d;
  }
  function monthLabel(ev) {
    var m = MONTHS[ev.when.getMonth()];
    return (ev.end > ev.when && ev.end.getMonth() !== ev.when.getMonth()) ? m + '\u2013' + MONTHS[ev.end.getMonth()] : m;
  }

  function slug(ev) {
    var d = ev.when;
    var ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return ymd + '-' + ev.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function toEvents(rows) {
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var out = [];
    rows.slice(1).forEach(function (r) {
      var o = {};
      head.forEach(function (h, i) { o[h] = (r[i] || '').trim(); });
      o.place = o.address || o.location || o.place || '';
      o.photo = o.poster || o.photo || '';
      o.zeffy = o['zeffy link'] || o.zeffy || '';
      o.date = o['start date'] || o.date || '';
      var r = parseRange(o.date);
      if (r) { o.when = r.start; o.end = r.end; }
      var e2 = parseOne(o['end date']);
      if (r && e2 && e2 >= r.start) o.end = e2;
      if (r) {
        var SPLIT = /\s+(?:-|\u2013|\u2014|to)\s+/i, dp = o.date.split(SPLIT);
        o.timeLabel = timeText(o, parseMinutes(dp[0]), parseMinutes(o['end date'] || dp[1] || ''));
      }
      if (o.when && o.title) { o.id = slug(o); out.push(o); }
    });
    return out;
  }

  // ----- Safe DOM helpers (sheet text is never inserted as HTML) -----
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  function httpsUrl(u) { return /^https?:\/\//i.test(u) ? u : null; }
  function photoSrc(p) {
    if (!p) return '/assets/images/placeholder.svg';
    if (/^https:\/\//i.test(p)) return p;
    if (/^[^\/\\<>:"|?*]+\.(jpe?g|png|webp|gif|svg)$/i.test(p) && p.indexOf('..') < 0) return '/assets/images/' + encodeURIComponent(p);
    return '/assets/images/placeholder.svg';
  }
  function photoImg(p, alt) {
    var img = document.createElement('img');
    img.src = photoSrc(p); img.alt = alt || ''; img.loading = 'lazy';
    img.onerror = function () {
      // Posters were converted from .png to .jpg: try the .jpg name before giving up.
      if (/\.png$/i.test(img.src) && !img.dataset.triedJpg) {
        img.dataset.triedJpg = '1';
        img.src = img.src.replace(/\.png$/i, '.jpg');
        return;
      }
      img.onerror = null; img.src = '/assets/images/placeholder.svg';
    };
    return img;
  }

  // Link that opens the address in Google Maps.
  function mapsLink(addr) {
    var a = document.createElement('a');
    a.textContent = addr;
    a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
    a.target = '_blank'; a.rel = 'noopener';
    a.title = 'Open in Google Maps';
    return a;
  }

  // ----- List rows -----
  function eventRow(ev) {
    var a = el('article', 'agenda-row rise');
    var when = el('div', 'when-col');
    when.appendChild(el('span', 'month', monthLabel(ev)));
    var day = el('span', 'day' + (ev.end > ev.when ? ' range' : ''), dayLabel(ev));
    when.appendChild(day);
    var what = el('div', 'what-col');
    what.appendChild(el('h3', '', ev.title));
    if (ev.timeLabel || ev.place) {
      var meta = el('p', 'meta');
      if (ev.timeLabel) meta.appendChild(document.createTextNode(ev.timeLabel));
      if (ev.timeLabel && ev.place) meta.appendChild(document.createTextNode(' \u00B7 '));
      if (ev.place) meta.appendChild(mapsLink(ev.place));
      what.appendChild(meta);
    }
    if (ev.description) what.appendChild(el('p', '', ev.description));
    var more = el('a', 'more', 'Read more →');
    more.href = '/event/?e=' + encodeURIComponent(ev.id);
    what.appendChild(more);
    var thumb = el('div', 'thumb-col');
    thumb.appendChild(photoImg(ev.photo));
    a.appendChild(when); a.appendChild(what); a.appendChild(thumb);
    return a;
  }

  function pastRow(ev) {
    var li = el('li', 'past-item rise');
    li.appendChild(el('span', 'past-date', monthLabel(ev) + ' ' + dayLabel(ev)));
    var title = el('span', 'past-title');
    var link = el('a', '', ev.title);
    link.href = '/event/?e=' + encodeURIComponent(ev.id);
    title.appendChild(link);
    li.appendChild(title);
    var where = el('span', 'past-where');
    if (ev.place) where.appendChild(mapsLink(ev.place));
    li.appendChild(where);
    return li;
  }

  function today() { var t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }

  function renderLists(events) {
    var t = today();
    var upcoming = events.filter(function (e) { return e.end >= t; })
      .sort(function (a, b) { return a.when - b.when; });
    var past = events.filter(function (e) { return e.end < t; })
      .sort(function (a, b) { return b.when - a.when; });

    if (upcomingEl) {
      var limit = parseInt(upcomingEl.getAttribute('data-limit'), 10) || upcoming.length;
      upcomingEl.textContent = '';
      if (!upcoming.length) {
        upcomingEl.appendChild(el('p', 'empty-note', 'No upcoming events right now. Follow us on Instagram to hear about new ones first.'));
      }
      upcoming.slice(0, limit).forEach(function (ev) { upcomingEl.appendChild(eventRow(ev)); });
    }

    if (pastEl) {
      pastEl.textContent = '';
      if (!past.length) { pastEl.appendChild(el('p', 'empty-note', 'Past events will appear here.')); }
      var year = null, list = null;
      past.forEach(function (ev) {
        var y = ev.when.getFullYear();
        if (y !== year) {
          year = y;
          pastEl.appendChild(el('h3', 'past-year', String(y)));
          list = el('ul', 'past-list');
          pastEl.appendChild(list);
        }
        list.appendChild(pastRow(ev));
      });
    }

    if (recentEl) {
      var rlimit = parseInt(recentEl.getAttribute('data-limit'), 10) || 3;
      var recent = past.slice(0, rlimit);
      if (!recent.length) {
        var rsec = recentEl.closest('section');
        if (rsec) rsec.remove();
      } else {
        recentEl.textContent = '';
        var rlist = el('ul', 'past-list');
        recent.forEach(function (ev) { rlist.appendChild(pastRow(ev)); });
        recentEl.appendChild(rlist);
      }
    }
  }

  // ----- Event detail page (/event/?e=<id>) -----
  function showNotFound() {
    if (!detailEl) return;
    detailEl.textContent = '';
    var sec = el('section', 'page-hero');
    var box = el('div', 'wrap');
    box.appendChild(el('h1', '', 'Event not found'));
    box.appendChild(el('p', '', 'We could not find that event. It may have been removed or the link may be wrong.'));
    var back = el('a', 'btn', 'See all events');
    back.href = '/events/';
    box.appendChild(back);
    sec.appendChild(box);
    detailEl.appendChild(sec);
  }

  function renderDetail(events) {
    var id = new URLSearchParams(location.search).get('e');
    var ev = events.filter(function (e) { return e.id === id; })[0];
    if (!ev) { showNotFound(); return; }
    var isPast = ev.end < today();
    document.title = ev.title + ' | Eliksir Foundation';
    detailEl.textContent = '';

    var hero = el('section', 'page-hero');
    var hw = el('div', 'wrap');
    var back = el('a', 'more', '← All events');
    back.href = '/events/';
    hw.appendChild(back);
    if (isPast) {
      var pill = el('div');
      var tag = el('span', 'pill-past', 'Past event');
      pill.appendChild(tag);
      hw.appendChild(pill);
    }
    var h1 = el('h1', 'rise', ev.title);
    h1.style.marginTop = isPast ? '12px' : '14px';
    hw.appendChild(h1);
    hero.appendChild(hw);

    var sec = el('section');
    var wrap = el('div', 'wrap detail-grid');
    var photo = el('div', 'photo card');
    photo.appendChild(photoImg(ev.photo, ev.title));
    var info = el('div');

    var facts = el('dl', 'facts');
    function fact(label, value, asMap) {
      if (!value) return;
      var row = el('div');
      row.appendChild(el('dt', '', label));
      var dd = el('dd');
      if (asMap) dd.appendChild(mapsLink(value)); else dd.textContent = value;
      row.appendChild(dd);
      facts.appendChild(row);
    }
    fact('Date', dateText(ev));
    fact('Time', ev.timeLabel);
    fact('Location', ev.place, true);
    info.appendChild(facts);

    var body = ev.description;
    if (body) {
      info.appendChild(el('h2', '', 'About this event'));
      body.split(/\n+/).forEach(function (para) {
        if (para.trim()) info.appendChild(el('p', '', para.trim()));
      });
    }

    var row = el('div', 'btn-row');
    var zeffy = httpsUrl(ev.zeffy);
    if (zeffy && !isPast) {
      var host = zeffy.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0];
      var isZeffy = /(^|\.)zeffy\.com$/i.test(host);
      var reg = el('a', 'btn', isZeffy ? 'Register on Zeffy' : 'Register');
      reg.href = zeffy; reg.target = '_blank'; reg.rel = 'noopener';
      row.appendChild(reg);
    }
    var all = el('a', 'btn ghost', 'Back to events');
    all.href = '/events/';
    row.appendChild(all);
    info.appendChild(row);

    wrap.appendChild(photo); wrap.appendChild(info);
    sec.appendChild(wrap);
    detailEl.appendChild(hero);
    detailEl.appendChild(sec);

    // Photos from the event (past events only)
    // File names can be separated by a comma, a semicolon or a new line.
    var pics = (ev.photos || '').replace(/(\.(?:jpe?g|png|webp|gif|svg))\s*,\s*/gi, '$1;')
      .split(/[;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (isPast && pics.length) {
      var gsec = el('section');
      var gw = el('div', 'wrap');
      gw.appendChild(el('h2', '', 'Photos from the event'));
      var grid = el('div', 'gallery');
      pics.forEach(function (name, i) {
        var src = photoSrc(name);
        if (src === '/assets/images/placeholder.svg' && name !== 'placeholder.svg') return;   // skip names we can't use
        var a = el('a');
        a.href = src; a.target = '_blank'; a.rel = 'noopener';
        a.appendChild(photoImg(name, ev.title + ' photo ' + (i + 1)));
        grid.appendChild(a);
      });
      if (grid.children.length) { gw.appendChild(grid); gsec.appendChild(gw); detailEl.appendChild(gsec); }
    }
  }

  // ----- Weekly programs -----
  function renderPrograms(rows) {
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var items = [];
    rows.slice(1).forEach(function (r) {
      var o = {};
      head.forEach(function (h, i) { o[h] = (r[i] || '').trim(); });
      o.place = o.location || o.address || o.place || '';
      if (o.name) items.push(o);
    });
    if (!items.length) return;                 // keep what is already on the page
    progEl.textContent = '';
    items.forEach(function (p) {
      var card = el('article', 'routine rise');
      var when = [p.day, p.time].filter(Boolean).join(' \u00B7 ');
      if (when) card.appendChild(el('span', 'when', when));
      card.appendChild(el('h3', '', p.name));
      if (p.place) {
        var loc = el('p', 'meta');
        loc.appendChild(mapsLink(p.place));
        card.appendChild(loc);
      }
      var body = el('div', 'routine-body');
      var paras = (p.description || '').split(/\n+/).filter(function (x) { return x.trim(); });
      if (progEl.hasAttribute('data-brief')) paras = [];   // home page: no description, only on the Events page
      paras.forEach(function (para) { body.appendChild(el('p', '', para.trim())); });
      if (body.children.length) card.appendChild(body);
      var link = httpsUrl(p.link);
      if (link) {
        var more = el('a', 'btn ghost', 'Learn more');
        more.href = link; more.target = '_blank'; more.rel = 'noopener';
        card.appendChild(more);
      }
      progEl.appendChild(card);
    });
  }

  if (progEl && PROGRAMS_CSV_URL) {
    fetch(PROGRAMS_CSV_URL)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (t) { var rows = parseCSV(t); if (rows.length > 1) renderPrograms(rows); })
      .catch(function () { /* keep the program already written in the page */ });
  }

  if (wantsEvents && EVENTS_CSV_URL) {
    fetch(EVENTS_CSV_URL)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (t) {
        var rows = parseCSV(t);
        if (rows.length < 1) throw new Error('empty');
        var events = toEvents(rows);
        if (detailEl) renderDetail(events); else renderLists(events);
      })
      .catch(function () {
        // The lists stay empty; the detail page says the event was not found.
        if (detailEl) showNotFound();
      });
  }
})();

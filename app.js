/* Ôn Writing — web tra cứu tĩnh. Nội dung nằm hoàn toàn trong data/*.json. */
(function () {
  'use strict';

  // Danh sách mục: thứ tự trên thanh điều hướng và tên ngắn. Thêm mục mới: thêm một dòng ở đây + file data/<id>.json.
  var SECTIONS = [
    { id: 'task1', short: 'Task 1' },
    { id: 'task2', short: 'Task 2' },
    { id: 'gre', short: 'GRE' }
  ];

  var TIP_HEAVY = 'Cụm nặng: mỗi đoạn chỉ dùng 1–2 cụm loại này';
  var TIP_SUPPLEMENT = 'Nội dung bổ sung ngoài khóa học';

  // Trường hợp lệ cho từng kind (để cảnh báo trường lạ).
  var COMMON_FIELDS = ['kind', 'title', 'core', 'source'];
  var KIND_FIELDS = {
    text: ['md'],
    list: ['items'],
    steps: ['items'],
    table: ['columns', 'rows'],
    phrases: ['items'],
    frames: ['items'],
    pitfalls: ['items'],
    essay: ['prompt', 'figure', 'data', 'paragraphs', 'note'],
    checklist: ['items'],
    scale: ['levels', 'note'],
    links: ['items']
  };
  var PAGE_FIELDS = ['id', 'group', 'title', 'summary', 'source', 'uses', 'blocks'];

  var state = {
    data: {},          // id -> section JSON
    order: {},         // id -> [page] theo thứ tự nhóm
    selftest: false,
    coreOnly: false,
    checks: {},        // trạng thái checklist trong phiên
    route: null
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var main = $('#main');
  var warned = {};

  function warn(msg) {
    if (warned[msg]) return;
    warned[msg] = true;
    console.warn('[Ôn Writing] ' + msg);
  }

  // ---------- Tiện ích văn bản ----------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Markdown tối giản: escape HTML trước, rồi **đậm**, *nghiêng*.
  function md(s) {
    if (s == null) return '';
    if (typeof s !== 'string') s = typeof s === 'object' ? JSON.stringify(s) : String(s);
    return esc(s)
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>');
  }
  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  }
  function plain(s) { return String(s || '').replace(/\*\*?/g, ''); }
  function wordCount(s) { var m = String(s || '').match(/[^\s—–]+/g); return m ? m.length : 0; }
  function badge(text, tip, cls) {
    return '<span class="badge ' + (cls || '') + '" tabindex="0" data-tip="' + esc(tip) + '" title="' + esc(tip) + '">' + esc(text) + '</span>';
  }
  function supplementBadge() { return badge('bổ sung', TIP_SUPPLEMENT, 'badge-supp'); }
  function arr(x, label) {
    if (Array.isArray(x)) return x;
    if (x != null) warn(label + ': cần mảng, nhận ' + typeof x);
    return [];
  }
  function sectionShort(id) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === id) return SECTIONS[i].short;
    return (state.data[id] && state.data[id].title) || id;
  }

  // ---------- Che đáp án (chế độ tự kiểm tra) ----------
  var PLACEHOLDER = { sb: 1, sth: 1, x: 1, y: 1, z: 1, n: 1, v: 1, adj: 1, adv: 1, ing: 1, ed: 1 };
  var FUNCTION_WORDS = {};
  'from with that this than into were when have been which their there those these then also over onto they them some such'
    .split(' ').forEach(function (w) { FUNCTION_WORDS[w] = 1; });
  function srcWords(source, dropBrackets) {
    var s = String(source || '');
    if (dropBrackets) s = s.replace(/\[[^\]]*\]/g, ' ');
    var m = s.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) || [];
    return m.filter(function (w) { return !PLACEHOLDER[w]; });
  }
  function wordMatch(tok, words) {
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (tok === w) return true;
      if (tok.length >= 4 && w.length >= 4) {
        var k = 0, n = Math.min(tok.length, w.length);
        while (k < n && tok[k] === w[k]) k++;
        if (k >= Math.max(4, w.length - 1) && k >= Math.max(4, tok.length - 4)) return true;
      }
    }
    return false;
  }
  // Trả về HTML ví dụ đã che các đoạn trùng với cụm/khung, hoặc null nếu không che được gì.
  function maskExample(example, source, dropBrackets) {
    var words = srcWords(source, dropBrackets);
    if (!words.length || !example) return null;
    var re = /[A-Za-z]+(?:['’][A-Za-z]+)*/g, toks = [], m;
    while ((m = re.exec(example))) toks.push({ s: m.index, e: m.index + m[0].length, w: m[0].toLowerCase() });
    var runs = [], cur = null;
    toks.forEach(function (t, i) {
      var hit = wordMatch(t.w, words);
      var joined = cur && /^[\s-]*$/.test(example.slice(toks[i - 1].e, t.s));
      if (hit && joined) { cur.end = i; }
      else if (hit) { cur = { start: i, end: i }; runs.push(cur); }
      else cur = null;
    });
    // Chỉ che cụm có nội dung: ≥3 từ, hoặc có ít nhất một từ ≥4 chữ cái không phải từ chức năng.
    runs = runs.filter(function (r) {
      if (r.end - r.start + 1 >= 3) return true;
      for (var i = r.start; i <= r.end; i++) if (toks[i].w.length >= 4 && !FUNCTION_WORDS[toks[i].w]) return true;
      return false;
    });
    if (!runs.length) return null;
    var out = '', pos = 0;
    runs.forEach(function (r) {
      var s = toks[r.start].s, e = toks[r.end].e;
      out += esc(example.slice(pos, s)) + '<span class="blank" aria-label="chỗ trống">' + '_'.repeat(Math.min(14, Math.max(5, e - s))) + '</span>';
      pos = e;
    });
    return out + esc(example.slice(pos));
  }

  // ---------- Renderer từng kind ----------
  var R = {};

  R.text = function (b) { return '<p class="md">' + md(b.md) + '</p>'; };

  R.list = function (b) {
    return '<ul class="list">' + arr(b.items, 'list.items').map(function (it) { return '<li>' + md(it) + '</li>'; }).join('') + '</ul>';
  };

  R.steps = function (b) {
    return '<ol class="steps">' + arr(b.items, 'steps.items').map(function (it) {
      if (typeof it === 'string') return '<li><div class="step-md">' + md(it) + '</div></li>';
      return '<li>' + (it.title ? '<div class="step-title">' + md(it.title) + '</div>' : '') +
        (it.md ? '<div class="step-md">' + md(it.md) + '</div>' : '') + '</li>';
    }).join('') + '</ol>';
  };

  R.table = function (b) {
    var cols = arr(b.columns, 'table.columns'), rows = arr(b.rows, 'table.rows');
    var h = '<div class="table-wrap" tabindex="0"><table>';
    if (cols.length) h += '<thead><tr>' + cols.map(function (c) { return '<th scope="col">' + md(c) + '</th>'; }).join('') + '</tr></thead>';
    h += '<tbody>' + rows.map(function (r) {
      return '<tr>' + (Array.isArray(r) ? r : [r]).map(function (c, i) {
        return '<td' + (cols[i] ? ' data-col="' + esc(plain(cols[i])) + '"' : '') + '>' + md(c) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
    return h;
  };

  R.phrases = function (b) {
    return '<div class="cards phrases">' + arr(b.items, 'phrases.items').map(function (it) {
      if (typeof it === 'string') it = { en: it };
      var masked = it.example ? maskExample(it.example, it.en, false) : null;
      var tags = Array.isArray(it.tags) && it.tags.length
        ? '<div class="tags">' + it.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</div>' : '';
      return '<div class="card phrase quiz' + (it.example && !masked ? ' ex-unmaskable' : '') + '" tabindex="0">' +
        '<div class="phrase-head"><span class="en answer">' + md(it.en) + '</span>' +
        (it.heavy ? badge('nặng', TIP_HEAVY, 'badge-heavy') : '') + '</div>' +
        '<div class="hidden-hint" aria-hidden="true">? ? ?</div>' +
        (it.vi ? '<div class="vi">' + md(it.vi) + '</div>' : '') +
        (it.example ? '<div class="example ex-full">' + md(it.example) + '</div>' +
          (masked ? '<div class="example ex-masked">' + masked + '</div>' : '') : '') +
        (it.note ? '<div class="note answer-extra">' + md(it.note) + '</div>' : '') +
        tags + '<div class="reveal-hint">Bấm để xem đáp án</div></div>';
    }).join('') + '</div>';
  };

  R.frames = function (b) {
    return '<div class="cards frames">' + arr(b.items, 'frames.items').map(function (it) {
      if (typeof it === 'string') it = { frame: it };
      var masked = it.example ? maskExample(it.example, it.frame, true) : null;
      return '<div class="card frame quiz' + (it.example && !masked ? ' ex-unmaskable' : '') + '" tabindex="0">' +
        '<div class="frame-text answer">' + md(it.frame) + '</div>' +
        '<div class="hidden-hint" aria-hidden="true">Khung câu nào?</div>' +
        (it.example ? '<div class="example ex-full">' + md(it.example) + '</div>' +
          (masked ? '<div class="example ex-masked">' + masked + '</div>' : '') : '') +
        (it.note ? '<div class="note">' + md(it.note) + '</div>' : '') +
        '<div class="reveal-hint">Bấm để xem đáp án</div></div>';
    }).join('') + '</div>';
  };

  R.pitfalls = function (b) {
    return '<div class="pitfalls"><div class="pit-head" aria-hidden="true"><span>✗ Sai</span><span>✓ Đúng</span><span>Lý do</span></div>' +
      arr(b.items, 'pitfalls.items').map(function (it) {
        return '<div class="pit">' +
          '<div class="pit-wrong"><span class="pit-icon" aria-label="Sai">✗</span><span class="txt">' + md(it.wrong) + '</span></div>' +
          '<div class="pit-right"><span class="pit-icon" aria-label="Đúng">✓</span><span class="txt">' + md(it.right) + '</span></div>' +
          '<div class="pit-why">' + md(it.why) + '</div></div>';
      }).join('') + '</div>';
  };


  // ---------- Biểu đồ đề bài Task 1 (SVG dựng từ dữ liệu) ----------
  var FIG = {};
  function svgOpen(w, h, label) {
    return '<svg class="fig-svg" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label || '') + '">';
  }
  function niceMax(v) {
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    var n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return n * p;
  }
  function fmtNum(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function legend(series) {
    return '<div class="fig-legend">' + series.map(function (s, i) {
      return '<span><i class="sw s' + (i + 1) + '"></i>' + esc(s.name) + '</span>';
    }).join('') + '</div>';
  }
  function figTitle(f) { return f.title ? '<div class="fig-title">' + esc(f.title) + '</div>' : ''; }

  FIG.line = function (f) {
    var W = 480, H = 270, L = 52, Rr = 26, T = 14, B = 34;
    var series = arr(f.series, 'figure.series'), xs = arr(f.x, 'figure.x');
    var max = f.yMax || niceMax(Math.max.apply(null, series.map(function (s) { return Math.max.apply(null, s.values); })));
    var ticks = f.ticks || 5, pw = W - L - Rr, ph = H - T - B;
    var X = function (i) { return L + pw * i / (xs.length - 1); };
    var Y = function (v) { return T + ph * (1 - v / max); };
    var o = svgOpen(W, H, f.title);
    for (var k = 0; k <= ticks; k++) {
      var v = max * k / ticks, y = Y(v);
      o += '<line class="grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="tick" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + fmtNum(+v.toFixed(2)) + '</text>';
    }
    xs.forEach(function (x, i) {
      o += '<text class="tick" x="' + X(i) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + esc(x) + '</text>';
    });
    var pf = f.projectFrom;
    if (pf) o += '<rect class="proj" x="' + X(pf - 1) + '" y="' + T + '" width="' + (X(xs.length - 1) - X(pf - 1)) + '" height="' + ph + '"/>' +
      '<text class="axis-label" x="' + (X(xs.length - 1) - 4) + '" y="' + (T + 12) + '" text-anchor="end">' + esc(f.projectLabel || 'Projected') + '</text>';
    series.forEach(function (s, si) {
      var pts = s.values.map(function (v, i) { return X(i) + ',' + Y(v); });
      o += '<polyline class="ln s' + (si + 1) + '" points="' + (pf ? pts.slice(0, pf) : pts).join(' ') + '"/>';
      if (pf) o += '<polyline class="ln dash s' + (si + 1) + '" points="' + pts.slice(pf - 1).join(' ') + '"/>';
      s.values.forEach(function (v, i) {
        o += '<circle class="dot s' + (si + 1) + '" cx="' + X(i) + '" cy="' + Y(v) + '" r="3.2"><title>' + esc(s.name + ', ' + xs[i] + ': ' + fmtNum(v)) + '</title></circle>';
      });
    });
    if (f.yLabel) o += '<text class="axis-label" x="' + L + '" y="' + (T - 3) + '">' + esc(f.yLabel) + '</text>';
    return figTitle(f) + o + '</svg>' + legend(series);
  };

  FIG.hbar = function (f) {
    var series = arr(f.series, 'figure.series'), cats = arr(f.categories, 'figure.categories');
    var bh = 13, gap = 3, grp = series.length * (bh + gap) + 12;
    var W = 480, L = 86, Rr = 40, T = 8, B = 26, H = T + B + grp * cats.length, pw = W - L - Rr;
    var max = f.xMax || niceMax(Math.max.apply(null, series.map(function (s) { return Math.max.apply(null, s.values); })));
    var unit = f.unit || '', ticks = f.ticks || 5;
    var o = svgOpen(W, H, f.title);
    for (var k = 0; k <= ticks; k++) {
      var x = L + pw * k / ticks;
      o += '<line class="grid" x1="' + x + '" x2="' + x + '" y1="' + T + '" y2="' + (H - B) + '"/>' +
        '<text class="tick" x="' + x + '" y="' + (H - B + 16) + '" text-anchor="middle">' + fmtNum(max * k / ticks) + unit + '</text>';
    }
    cats.forEach(function (c, ci) {
      var y0 = T + ci * grp + 6;
      o += '<text class="cat" x="' + (L - 8) + '" y="' + (y0 + grp / 2 - 4) + '" text-anchor="end">' + esc(c) + '</text>';
      series.forEach(function (s, si) {
        var v = s.values[ci], y = y0 + si * (bh + gap), w = pw * v / max;
        o += '<rect class="bar s' + (si + 1) + '" x="' + L + '" y="' + y + '" width="' + w + '" height="' + bh + '" rx="2"><title>' +
          esc((series.length > 1 ? s.name + ', ' : '') + c + ': ' + fmtNum(v) + unit) + '</title></rect>' +
          '<text class="val" x="' + (L + w + 4) + '" y="' + (y + bh - 3) + '">' + fmtNum(v) + unit + '</text>';
      });
    });
    return figTitle(f) + o + '</svg>' + (series.length > 1 ? legend(series) : '');
  };

  FIG.table = function (f) { return figTitle(f) + R.table(f); };

  FIG.pie = function (f) {
    var cats = arr(f.categories, 'figure.categories');
    var pies = arr(f.pies, 'figure.pies').map(function (p) {
      var c = 120, r = 92, a0 = -Math.PI / 2, tot = p.values.reduce(function (x, y) { return x + y; }, 0);
      var o = svgOpen(240, 240, p.name);
      p.values.forEach(function (v, i) {
        var a1 = a0 + 2 * Math.PI * v / tot, am = (a0 + a1) / 2, big = a1 - a0 > Math.PI ? 1 : 0;
        o += '<path class="bar s' + (i + 1) + ' slice" d="M' + c + ',' + c + 'L' + (c + r * Math.cos(a0)) + ',' + (c + r * Math.sin(a0)) +
          'A' + r + ',' + r + ' 0 ' + big + ' 1 ' + (c + r * Math.cos(a1)) + ',' + (c + r * Math.sin(a1)) + 'z"><title>' + esc(cats[i] + ': ' + v + '%') + '</title></path>';
        var lr = v >= 8 ? r * 0.64 : r + 13;
        o += '<text class="' + (v >= 8 ? 'pie-in' : 'val') + '" text-anchor="middle" x="' + (c + lr * Math.cos(am)) + '" y="' + (c + lr * Math.sin(am) + 4) + '">' + v + '%</text>';
        a0 = a1;
      });
      return '<div class="fig-cell"><div class="fig-title">' + esc(p.name) + '</div>' + o + '</svg></div>';
    });
    return figTitle(f) + '<div class="fig-multi">' + pies.join('') + '</div>' + legend(cats.map(function (n) { return { name: n }; }));
  };

  FIG.multi = function (f) {
    return '<div class="fig-multi">' + arr(f.charts, 'figure.charts').map(function (c) {
      return '<div class="fig-cell">' + figureHtml(c) + '</div>';
    }).join('') + '</div>';
  };

  FIG.process = function (f) {
    return figTitle(f) + '<ol class="fig-process">' + arr(f.steps, 'figure.steps').map(function (s, i, a) {
      return '<li><span class="fig-step"><b>' + (i + 1) + '</b><span><strong>' + esc(s.label) + '</strong>' +
        (s.sub ? '<small>' + esc(s.sub) + '</small>' : '') + '</span></span>' +
        (i < a.length - 1 ? '<span class="fig-arrow" aria-hidden="true">→</span>' : '') + '</li>';
    }).join('') + '</ol>';
  };

  FIG.cycle = function (f) {
    var st = arr(f.steps, 'figure.steps'), n = st.length, W = 480, H = 330, cx = 240, cy = 165, rx = 150, ry = 112;
    var pos = st.map(function (s, i) {
      var a = -Math.PI / 2 + 2 * Math.PI * i / n;
      return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), a: a };
    });
    var o = svgOpen(W, H, f.title) + '<defs><marker id="fig-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="ah"/></marker></defs>';
    st.forEach(function (s, i) {
      var a1 = pos[i].a + 0.42, a2 = pos[i].a + 2 * Math.PI / n - 0.42, am = (a1 + a2) / 2;
      var p1 = [cx + rx * Math.cos(a1), cy + ry * Math.sin(a1)], p2 = [cx + rx * Math.cos(a2), cy + ry * Math.sin(a2)];
      o += '<path class="cyc" marker-end="url(#fig-ah)" d="M' + p1 + 'A' + rx + ',' + ry + ' 0 0 1 ' + p2 + '"/>';
      if (s.next) {
        var lx = cx + (rx - 34) * Math.cos(am), ly = cy + (ry - 26) * Math.sin(am);
        o += '<text class="tick" text-anchor="middle" x="' + lx + '" y="' + (ly + 4) + '">' + esc(s.next) + '</text>';
      }
    });
    st.forEach(function (s, i) {
      var p = pos[i], w = 150, h = s.sub ? 46 : 30;
      o += '<rect class="node" x="' + (p.x - w / 2) + '" y="' + (p.y - h / 2) + '" width="' + w + '" height="' + h + '" rx="8"/>' +
        '<text class="node-t" text-anchor="middle" x="' + p.x + '" y="' + (p.y + (s.sub ? -4 : 5)) + '">' + esc(s.label) + '</text>' +
        (s.sub ? '<text class="tick" text-anchor="middle" x="' + p.x + '" y="' + (p.y + 13) + '">' + esc(s.sub) + '</text>' : '');
    });
    return figTitle(f) + o + '</svg>';
  };

  // Bản đồ: mỗi panel là hệ toạ độ 300x240, item = {t: loại, x, y, w, h, label} hoặc {t: 'path', d, cls}.
  FIG.map = function (f) {
    return '<div class="fig-multi">' + arr(f.panels, 'figure.panels').map(function (p) {
      var o = svgOpen(300, 240, p.title) + '<rect class="map-bg" x="0" y="0" width="300" height="240" rx="6"/>';
      arr(p.items, 'figure.items').forEach(function (it) {
        if (it.t === 'path') { o += '<path class="map-' + esc(it.cls) + '" d="' + esc(it.d) + '"/>'; return; }
        o += '<rect class="map-' + esc(it.t) + '" x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" rx="3"/>';
        if (it.label) {
          var lines = String(it.label).split('\n');
          lines.forEach(function (ln, k) {
            o += '<text class="map-lb" text-anchor="middle" x="' + (it.x + it.w / 2) + '" y="' + (it.y + it.h / 2 + 4 + (k - (lines.length - 1) / 2) * 11) + '">' + esc(ln) + '</text>';
          });
        }
      });
      o += '<g class="map-n"><path d="M283,26 L288,12 L293,26 L288,22z"/><text x="288" y="38" text-anchor="middle">N</text></g>';
      return '<div class="fig-cell"><div class="fig-title">' + esc(p.title) + '</div>' + o + '</svg></div>';
    }).join('') + '</div>';
  };

  function figureHtml(f) {
    if (!f || !FIG[f.type]) { warn('figure: loại lạ ' + (f && f.type)); return ''; }
    return FIG[f.type](f);
  }

  R.essay = function (b) {
    var paras = arr(b.paragraphs, 'essay.paragraphs');
    var total = paras.reduce(function (n, p) { return n + wordCount(p && p.en); }, 0);
    return '<div class="essay">' +
      (b.prompt ? '<div class="essay-prompt"><div class="essay-label">Đề bài</div>' + md(b.prompt) + '</div>' : '') +
      (b.figure ? '<figure class="essay-figure">' + figureHtml(b.figure) + '</figure>' : '') +
      (b.data ? '<div class="essay-data"><span class="essay-label">Số liệu</span> ' + md(b.data) + '</div>' : '') +
      '<div class="essay-body">' + paras.map(function (p) {
        if (typeof p === 'string') p = { en: p };
        return '<div class="essay-para">' + (p.label ? '<div class="para-label">' + esc(p.label) + '</div>' : '') +
          '<p>' + md(p.en) + '</p></div>';
      }).join('') + '</div>' +
      '<div class="essay-count">' + total + ' từ</div>' +
      (b.note ? '<div class="essay-note"><span class="essay-label">Phân tích</span> ' + md(b.note) + '</div>' : '') +
      '</div>';
  };

  R.checklist = function (b, ctx) {
    return '<ul class="checklist">' + arr(b.items, 'checklist.items').map(function (it, i) {
      var key = ctx.key + ':' + i;
      return '<li><label><input type="checkbox" data-check="' + esc(key) + '"' + (state.checks[key] ? ' checked' : '') + '>' +
        '<span>' + md(it) + '</span></label></li>';
    }).join('') + '</ul>';
  };

  R.scale = function (b) {
    var lv = arr(b.levels, 'scale.levels');
    return '<div class="scale-wrap" tabindex="0"><div class="scale" style="--n:' + Math.max(lv.length, 1) + '">' +
      lv.map(function (l, i) {
        return '<div class="scale-col" style="--i:' + i + '"><div class="scale-label">' + md(l.label) + '</div>' +
          '<ul>' + arr(l.words, 'scale.words').map(function (w) { return '<li>' + md(w) + '</li>'; }).join('') + '</ul></div>';
      }).join('') + '</div><div class="scale-axis" aria-hidden="true"><span>nhỏ</span><span>lớn</span></div></div>' +
      (b.note ? '<p class="note scale-note">' + md(b.note) + '</p>' : '');
  };

  R.links = function (b) {
    return '<div class="links">' + arr(b.items, 'links.items').map(function (it) {
      var sec = state.data[it.section], page = null;
      if (sec) page = findPage(sec, it.page);
      if (!page) warn('Liên kết hỏng: ' + it.section + '/' + it.page);
      return '<a class="link-card" data-sec="' + esc(it.section) + '" href="#/' + esc(it.section) + (it.page ? '/' + esc(it.page) : '') + '">' +
        '<span class="link-sec">' + esc(sectionShort(it.section)) + '</span>' +
        '<span class="link-label">' + md(it.label || (page && page.title) || it.page) + '</span>' +
        '<span class="link-arrow" aria-hidden="true">→</span></a>';
    }).join('') + '</div>';
  };

  // kind lạ: hiện dạng văn bản đơn giản.
  function renderUnknown(b) {
    var parts = [];
    (function collect(v) {
      if (v == null) return;
      if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
      else if (Array.isArray(v)) v.forEach(collect);
      else if (typeof v === 'object') Object.keys(v).forEach(function (k) { if (k !== 'kind' && k !== 'title' && k !== 'core' && k !== 'source') collect(v[k]); });
    })(b);
    return '<div class="unknown">' + parts.map(function (p) { return '<p>' + md(p) + '</p>'; }).join('') + '</div>';
  }

  function renderBlock(b, idx, ctx) {
    if (!b || typeof b !== 'object') { warn(ctx.where + ': block không hợp lệ'); return ''; }
    var kind = b.kind, inner, extra = '';
    var fn = Object.prototype.hasOwnProperty.call(R, kind) ? R[kind] : null;
    if (!fn) {
      warn(ctx.where + ': kind lạ "' + kind + '", hiển thị dạng văn bản');
      inner = renderUnknown(b);
    } else {
      try {
        inner = fn(b, ctx);
      } catch (e) {
        console.warn('[Ôn Writing] Lỗi khi hiển thị block ' + kind + ' tại ' + ctx.where, e);
        inner = renderUnknown(b);
      }
      var known = COMMON_FIELDS.concat(KIND_FIELDS[kind]);
      Object.keys(b).forEach(function (k) {
        if (known.indexOf(k) === -1) {
          warn(ctx.where + ': trường lạ "' + k + '" trong block ' + kind + ', hiển thị dạng văn bản');
          extra += '<div class="unknown-field"><span class="uf-key">' + esc(k) + ':</span> ' + md(b[k]) + '</div>';
        }
      });
    }
    var head = '';
    if (b.title || b.source === 'supplement') {
      head = '<div class="block-head">' + (b.title ? '<h2>' + md(b.title) + '</h2>' : '<span></span>') +
        (b.source === 'supplement' ? supplementBadge() : '') + '</div>';
    }
    return '<section class="block kind-' + esc(kind) + (b.core ? ' is-core' : '') + '" id="b' + idx + '" data-kind="' + esc(kind) + '">' +
      head + inner + extra + '</section>';
  }

  // ---------- Dữ liệu ----------
  function findPage(sec, id) {
    var ps = sec.pages || [];
    for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  }

  function pagesInGroup(secId, g) {
    return state.order[secId].filter(function (p) { return (p._group || p.group) === g.id; });
  }

  function prepare(sec) {
    var groups = arr(sec.groups, sec.id + '.groups').slice();
    var pages = arr(sec.pages, sec.id + '.pages');
    var ids = groups.map(function (g) { return g.id; });
    var orphan = pages.filter(function (p) { return ids.indexOf(p.group) === -1; });
    if (orphan.length) {
      orphan.forEach(function (p) { warn(sec.id + '/' + p.id + ': group "' + p.group + '" không có trong groups'); });
      groups.push({ id: '__other', title: 'Khác' });
    }
    sec._groups = groups;
    orphan.forEach(function (p) { p._group = '__other'; });
    var ordered = [];
    groups.forEach(function (g) {
      pages.forEach(function (p) { if ((p._group || p.group) === g.id) ordered.push(p); });
    });
    pages.forEach(function (p) {
      Object.keys(p).forEach(function (k) { if (PAGE_FIELDS.indexOf(k) === -1 && k !== '_group') warn(sec.id + '/' + p.id + ': trường trang lạ "' + k + '"'); });
    });
    state.order[sec.id] = ordered;
  }

  function loadAll() {
    return Promise.all(SECTIONS.map(function (s) {
      return fetch('data/' + s.id + '.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' khi tải data/' + s.id + '.json'); return r.json(); })
        .then(function (j) { j.id = j.id || s.id; state.data[s.id] = j; prepare(j); })
        .catch(function (e) { console.error('[Ôn Writing] Không tải được data/' + s.id + '.json', e); state.data[s.id] = null; });
    }));
  }

  // ---------- Tìm kiếm ----------
  var index = [];
  var SEARCH_FIELDS = ['en', 'vi', 'frame', 'example', 'wrong', 'right'];
  function buildIndex() {
    index = [];
    SECTIONS.forEach(function (s) {
      var sec = state.data[s.id];
      if (!sec) return;
      (state.order[s.id] || []).forEach(function (p) {
        index.push({ sec: s.id, page: p, block: null, field: 'title', text: plain(p.title) });
        arr(p.blocks, 'blocks').forEach(function (b, bi) {
          if (!b || !Array.isArray(b.items)) return;
          b.items.forEach(function (it) {
            if (!it || typeof it !== 'object') return;
            SEARCH_FIELDS.forEach(function (f) {
              if (typeof it[f] === 'string' && it[f]) index.push({ sec: s.id, page: p, block: bi, field: f, text: plain(it[f]) });
            });
          });
        });
      });
    });
    index.forEach(function (e) { e.folded = fold(e.text); });
  }

  function highlight(text, folded, q) {
    // fold() giữ nguyên độ dài chuỗi với chữ Latin/tiếng Việt đã chuẩn hóa NFC, nên dùng được vị trí.
    var i = folded.indexOf(q);
    if (i < 0 || folded.length !== text.length) return esc(text);
    var start = Math.max(0, i - 50), end = Math.min(text.length, i + q.length + 70);
    return (start > 0 ? '…' : '') + esc(text.slice(start, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' +
      esc(text.slice(i + q.length, end)) + (end < text.length ? '…' : '');
  }

  var FIELD_LABEL = { title: 'tiêu đề trang', en: 'cụm từ', vi: 'nghĩa', frame: 'khung câu', example: 'ví dụ', wrong: 'sai', right: 'đúng' };
  function runSearch(q) {
    var box = $('#searchResults');
    var fq = fold(q.trim()).replace(/\s+/g, ' ');
    if (fq.length < 2) { box.innerHTML = fq ? '<p class="search-empty">Gõ ít nhất 2 ký tự.</p>' : ''; return; }
    var hits = [], seen = {};
    index.forEach(function (e) {
      if (e.folded.indexOf(fq) === -1) return;
      var key = e.sec + '|' + e.page.id + '|' + e.block + '|' + e.text;
      if (seen[key]) return;
      seen[key] = 1;
      hits.push(e);
    });
    hits.sort(function (a, b) {
      var sa = (a.field === 'title' ? 0 : 1) + (a.folded.indexOf(fq) === 0 ? 0 : 0.5);
      var sb = (b.field === 'title' ? 0 : 1) + (b.folded.indexOf(fq) === 0 ? 0 : 0.5);
      return sa - sb;
    });
    if (!hits.length) { box.innerHTML = '<p class="search-empty">Không có kết quả cho “' + esc(q) + '”.</p>'; return; }
    var shown = hits.slice(0, 60);
    box.innerHTML = '<p class="search-count">' + hits.length + ' kết quả' + (hits.length > shown.length ? ' (hiện 60 đầu tiên)' : '') + '</p>' +
      shown.map(function (e) {
        var href = '#/' + e.sec + '/' + e.page.id + (e.block != null ? '?b=' + e.block : '');
        return '<a class="result" role="listitem" data-sec="' + esc(e.sec) + '" href="' + href + '">' +
          '<span class="result-where"><span class="result-sec">' + esc(sectionShort(e.sec)) + '</span> · ' + esc(plain(e.page.title)) +
          '<span class="result-field">' + esc(FIELD_LABEL[e.field] || e.field) + '</span></span>' +
          '<span class="result-text">' + highlight(e.text, e.folded, fq) + '</span></a>';
      }).join('');
  }

  // ---------- Điều hướng ----------
  function parseHash() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    var q = '', qi = h.indexOf('?');
    if (qi >= 0) { q = h.slice(qi + 1); h = h.slice(0, qi); }
    var parts = h.split('/').filter(Boolean);
    var bm = /(?:^|&)b=(\d+)/.exec(q);
    return { sec: parts[0] || null, page: parts[1] || null, block: bm ? +bm[1] : null };
  }

  function renderTabs(active) {
    $('#tabs').innerHTML = SECTIONS.map(function (s) {
      var ok = !!state.data[s.id];
      return '<a class="tab' + (s.id === active ? ' active' : '') + '" data-sec="' + s.id + '" href="#/' + s.id + '"' +
        (s.id === active ? ' aria-current="page"' : '') + (ok ? '' : ' aria-disabled="true"') + '>' + esc(s.short) + '</a>';
    }).join('');
  }

  function renderSidebar(secId, pageId) {
    var sb = $('#sidebar');
    var sec = secId && state.data[secId];
    if (!sec) {
      sb.innerHTML = '<div class="side-group"><div class="side-title">Các mục</div><ul>' + SECTIONS.map(function (s) {
        var d = state.data[s.id];
        return d ? '<li><a data-sec="' + s.id + '" href="#/' + s.id + '">' + esc(d.title) + '</a></li>' : '';
      }).join('') + '</ul></div>';
      return;
    }
    var h = '<a class="side-sec" href="#/' + secId + '"' + (!pageId ? ' aria-current="page"' : '') + '>' + esc(sec.title) + '</a>';
    sec._groups.forEach(function (g) {
      var ps = pagesInGroup(secId, g);
      if (!ps.length) return;
      h += '<div class="side-group"><div class="side-title">' + esc(g.title) + '</div><ul>' + ps.map(function (p) {
        var cur = p.id === pageId;
        return '<li><a href="#/' + secId + '/' + esc(p.id) + '"' + (cur ? ' aria-current="page" class="current"' : '') + '>' + esc(plain(p.title)) + '</a></li>';
      }).join('') + '</ul></div>';
    });
    // Trang dùng chung từ mục khác (uses chứa mục này)
    var shared = [];
    SECTIONS.forEach(function (s) {
      if (s.id === secId || !state.data[s.id]) return;
      state.order[s.id].forEach(function (p) {
        if (Array.isArray(p.uses) && p.uses.indexOf(secId) !== -1) shared.push({ sec: s.id, page: p });
      });
    });
    if (shared.length) {
      h += '<div class="side-group"><div class="side-title">Dùng chung</div><ul>' + shared.map(function (x) {
        return '<li><a data-sec="' + x.sec + '" href="#/' + x.sec + '/' + esc(x.page.id) + '">' + esc(plain(x.page.title)) +
          ' <span class="side-from">' + esc(sectionShort(x.sec)) + '</span></a></li>';
      }).join('') + '</ul></div>';
    }
    sb.innerHTML = h;
  }

  function usesLabel(p) {
    if (!Array.isArray(p.uses) || p.uses.length < 2) return '';
    return '<span class="uses">Dùng cho: ' + p.uses.map(sectionShort).map(esc).join(', ') + '</span>';
  }

  function renderHome() {
    document.title = 'Ôn Writing';
    main.innerHTML = '<div class="home"><h1>Ôn Writing</h1><p class="lead">Tra cứu nhanh cụm từ, khung câu, lỗi hay gặp và bài mẫu. Bật <strong>Tự kiểm tra</strong> để che đáp án; bật <strong>Trước khi viết</strong> trong mỗi trang để chỉ xem phần lõi.</p>' +
      '<div class="home-cards">' + SECTIONS.map(function (s) {
        var d = state.data[s.id];
        if (!d) return '<div class="home-card disabled" data-sec="' + s.id + '"><span class="hc-short">' + esc(s.short) + '</span><span class="hc-title">Không tải được dữ liệu</span></div>';
        return '<a class="home-card" data-sec="' + s.id + '" href="#/' + s.id + '"><span class="hc-short">' + esc(s.short) + '</span>' +
          '<span class="hc-title">' + esc(d.title) + '</span><span class="hc-desc">' + md(d.description) + '</span>' +
          '<span class="hc-meta">' + state.order[s.id].length + ' trang</span></a>';
      }).join('') + '</div></div>';
  }

  function renderSection(secId) {
    var sec = state.data[secId];
    document.title = sec.title + ' · Ôn Writing';
    var h = '<div class="section-home"><h1>' + esc(sec.title) + '</h1>' + (sec.description ? '<p class="lead">' + md(sec.description) + '</p>' : '');
    sec._groups.forEach(function (g) {
      var ps = pagesInGroup(secId, g);
      if (!ps.length) return;
      h += '<h2 class="group-title">' + esc(g.title) + '</h2><div class="page-list">' + ps.map(function (p) {
        return '<a class="page-item" href="#/' + secId + '/' + esc(p.id) + '"><span class="pi-title">' + esc(plain(p.title)) +
          (p.source === 'supplement' ? ' ' + badge('bổ sung', TIP_SUPPLEMENT, 'badge-supp') : '') + '</span>' +
          (p.summary ? '<span class="pi-sum">' + md(p.summary) + '</span>' : '') + '</a>';
      }).join('') + '</div>';
    });
    main.innerHTML = h + '</div>';
  }

  function renderPage(secId, page, blockIdx) {
    var sec = state.data[secId];
    var list = state.order[secId], i = list.indexOf(page);
    var prev = list[i - 1], next = list[i + 1];
    var group = sec._groups.filter(function (g) { return g.id === page.group; })[0];
    document.title = plain(page.title) + ' · ' + sectionShort(secId) + ' · Ôn Writing';
    var blocks = arr(page.blocks, secId + '/' + page.id + '.blocks');
    var nCore = blocks.filter(function (b) { return b && b.core; }).length;
    var ctxBase = secId + '/' + page.id;

    var h = '<article class="page' + (state.coreOnly && nCore ? ' core-only' : '') + '">' +
      '<nav class="crumbs" aria-label="Vị trí"><a href="#/' + secId + '">' + esc(sectionShort(secId)) + '</a>' +
      (group ? ' <span aria-hidden="true">›</span> ' + esc(group.title) : '') + '</nav>' +
      '<h1>' + esc(plain(page.title)) + '</h1>' +
      '<div class="page-meta">' + (page.source === 'supplement' ? supplementBadge() : '') + usesLabel(page) + '</div>' +
      (page.summary ? '<p class="summary">' + md(page.summary) + '</p>' : '') +
      '<div class="page-tools"><label class="switch switch-sm" title="Chỉ hiện các khối lõi để liếc 2 phút trước khi viết">' +
      '<input type="checkbox" id="coreToggle"' + (state.coreOnly && nCore ? ' checked' : '') + (nCore ? '' : ' disabled') + '>' +
      '<span class="switch-track" aria-hidden="true"></span><span class="switch-label">Trước khi viết</span></label>' +
      '<span class="core-info">' + (nCore ? 'Phần lõi: ' + nCore + '/' + blocks.length + ' khối' : 'Trang này không đánh dấu phần lõi') + '</span></div>' +
      '<div class="blocks">' + blocks.map(function (b, bi) {
        return renderBlock(b, bi, { key: ctxBase + ':' + bi, where: ctxBase + ' block #' + bi });
      }).join('') + '</div>' +
      '<nav class="pager" aria-label="Trang trước / sau">' +
      (prev ? '<a class="pager-prev" href="#/' + secId + '/' + esc(prev.id) + '"><span class="pager-dir">← Trang trước</span><span class="pager-title">' + esc(plain(prev.title)) + '</span></a>' : '<span></span>') +
      (next ? '<a class="pager-next" href="#/' + secId + '/' + esc(next.id) + '"><span class="pager-dir">Trang sau →</span><span class="pager-title">' + esc(plain(next.title)) + '</span></a>' : '<span></span>') +
      '</nav></article>';
    main.innerHTML = h;

    if (blockIdx != null) {
      var el = document.getElementById('b' + blockIdx);
      if (el) {
        if (state.coreOnly && !el.classList.contains('is-core')) setCoreOnly(false);
        requestAnimationFrame(function () {
          el.scrollIntoView({ block: 'start' });
          el.classList.add('flash');
          setTimeout(function () { el.classList.remove('flash'); }, 1800);
        });
      }
    }
  }

  function renderNotFound(msg) {
    document.title = 'Không tìm thấy · Ôn Writing';
    main.innerHTML = '<div class="notfound"><h1>Không tìm thấy</h1><p>' + esc(msg) + '</p><p><a href="#/">Về trang chủ</a></p></div>';
  }

  function route() {
    var r = parseHash();
    var prevKey = state.route && (state.route.sec + '/' + state.route.page);
    state.route = r;
    var sec = r.sec ? state.data[r.sec] : null;
    var activeSec = sec ? r.sec : '';
    document.body.setAttribute('data-section', activeSec);
    renderTabs(activeSec);
    if (!r.sec) { renderSidebar(null); renderHome(); }
    else if (!sec) { renderSidebar(null); renderNotFound(state.data.hasOwnProperty(r.sec) ? 'Không tải được dữ liệu mục “' + r.sec + '”.' : 'Không có mục “' + r.sec + '”.'); }
    else if (!r.page) { renderSidebar(r.sec, null); renderSection(r.sec); }
    else {
      var page = findPage(sec, r.page);
      renderSidebar(r.sec, page ? page.id : null);
      if (page) renderPage(r.sec, page, r.block);
      else renderNotFound('Không có trang “' + r.page + '” trong mục ' + sec.title + '.');
    }
    closeMenu();
    if (r.block == null && prevKey !== r.sec + '/' + r.page) window.scrollTo(0, 0);
  }

  // ---------- Công tắc ----------
  function setSelftest(on) {
    state.selftest = on;
    document.body.classList.toggle('selftest', on);
    $('#selftestToggle').checked = on;
    Array.prototype.forEach.call(document.querySelectorAll('.quiz.revealed'), function (c) { c.classList.remove('revealed'); });
  }
  function setCoreOnly(on) {
    state.coreOnly = on;
    var art = $('.page');
    if (art) art.classList.toggle('core-only', on);
    var t = $('#coreToggle');
    if (t) t.checked = on;
  }

  function openMenu() {
    document.body.classList.add('menu-open');
    $('#backdrop').hidden = false;
    $('#menuBtn').setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    document.body.classList.remove('menu-open');
    $('#backdrop').hidden = true;
    $('#menuBtn').setAttribute('aria-expanded', 'false');
  }
  function openSearch() {
    $('#searchPanel').hidden = false;
    $('#searchBtn').setAttribute('aria-expanded', 'true');
    document.body.classList.add('search-open');
    $('#searchInput').focus();
    $('#searchInput').select();
  }
  function closeSearch() {
    $('#searchPanel').hidden = true;
    $('#searchBtn').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('search-open');
  }

  function bind() {
    $('#menuBtn').addEventListener('click', function () {
      document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
    });
    $('#backdrop').addEventListener('click', closeMenu);
    $('#searchBtn').addEventListener('click', function () { $('#searchPanel').hidden ? openSearch() : closeSearch(); });
    var t;
    $('#searchInput').addEventListener('input', function (e) {
      clearTimeout(t);
      var v = e.target.value;
      t = setTimeout(function () { runSearch(v); }, 80);
    });
    $('#searchResults').addEventListener('click', function (e) { if (e.target.closest('a.result')) closeSearch(); });
    $('#selftestToggle').addEventListener('change', function (e) { setSelftest(e.target.checked); });

    main.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'coreToggle') setCoreOnly(el.checked);
      else if (el.hasAttribute('data-check')) state.checks[el.getAttribute('data-check')] = el.checked;
    });
    function toggleCard(card) { if (state.selftest) card.classList.toggle('revealed'); }
    main.addEventListener('click', function (e) {
      var card = e.target.closest('.quiz');
      if (card && !e.target.closest('a')) toggleCard(card);
    });
    main.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('quiz') && state.selftest) {
        e.preventDefault();
        toggleCard(e.target);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSearch(); closeMenu(); }
      else if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
    });
    window.addEventListener('hashchange', route);
    window.addEventListener('beforeprint', function () { document.body.classList.add('printing'); });
    window.addEventListener('afterprint', function () { document.body.classList.remove('printing'); });
  }

  bind();
  loadAll().then(function () {
    if (SECTIONS.every(function (s) { return !state.data[s.id]; })) {
      main.innerHTML = '<div class="notfound"><h1>Không tải được dữ liệu</h1><p>Nếu bạn đang mở file trực tiếp, hãy chạy máy chủ cục bộ: <code>python -m http.server</code> rồi mở <code>http://localhost:8000</code>.</p></div>';
      return;
    }
    buildIndex();
    route();
  });

  // Dùng cho kiểm thử
  window.__writing = { state: state, maskExample: maskExample, md: md };
})();

(() => {
  'use strict';

  /* ===================== Sessão ===================== */
  let user = null;
  try { user = JSON.parse(localStorage.getItem('ce_user')); } catch { /* sessão inválida */ }
  if (!user || !user.email || !user.uid) { localStorage.removeItem('ce_user'); location.replace('index.html'); return; }

  /* ===================== Utilitários ===================== */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const pct = v => (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
  const pctPlain = v => v.toFixed(1).replace('.', ',') + '%';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  const pad = n => String(n).padStart(2, '0');
  const sum = (arr, fn) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
  const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const monthKey = d => (typeof d === 'string' ? d.slice(0, 7) : `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  const shiftMonth = (key, n) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); };
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const monthLabel = key => { const [y, m] = key.split('-'); return `${MONTHS[m - 1]}/${y.slice(2)}`; };
  const monthName = key => MONTHS_FULL[Number(key.split('-')[1]) - 1];
  const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '-' : `${d.toLocaleDateString('pt-BR')} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hue = s => [...String(s)].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
  const variation = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0);
  const PAYMENTS = ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Outro'];

  /* ===================== Armazenamento local ===================== */
  const DB_KEY = 'ce_data_' + user.email.toLowerCase();
  const emptyDB = () => ({ products: [], entries: [], sales: [], settings: { storeName: 'Controle de Estoque' } });

  function normalizeDB(d) {
    const base = emptyDB();
    if (!d || !Array.isArray(d.products)) return base;
    return {
      products: d.products.filter(p => p && p.id && p.name).map(p => ({
        id: String(p.id), name: String(p.name), category: String(p.category || ''), description: String(p.description || ''),
        cost: Number(p.cost) || 0, price: Number(p.price) || 0, qty: Math.floor(Number(p.qty) || 0),
        min: Math.floor(Number(p.min) || 0), ideal: Math.floor(Number(p.ideal) || 0), createdAt: String(p.createdAt || localISO())
      })),
      entries: Array.isArray(d.entries) ? d.entries.filter(e => e && e.id && e.date) : [],
      sales: Array.isArray(d.sales) ? d.sales.filter(s => s && s.id && s.date && Array.isArray(s.items)) : [],
      settings: { ...base.settings, ...(d.settings || {}) }
    };
  }

  function loadDB() {
    try { return normalizeDB(JSON.parse(localStorage.getItem(DB_KEY))); } catch { return emptyDB(); }
  }

  let db = loadDB();

  function save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      toast('Não foi possível salvar: o armazenamento do navegador está cheio.', 'error');
    }
    updateAlerts();
  }

  /* ===================== Regras de estoque ===================== */
  const getProduct = id => db.products.find(p => p.id === id);
  const stockStatus = p => (p.qty <= 0 ? 'out' : p.qty <= p.min ? 'low' : p.qty <= Math.ceil(p.min * 1.5) ? 'warn' : 'ok');
  const alertProducts = () => db.products.filter(p => p.qty <= p.min).sort((a, b) => (a.qty - a.min) - (b.qty - b.min));
  const targetStock = p => (p.ideal > p.min ? p.ideal : Math.max(p.min * 2, p.min + 1));
  const suggestedQty = p => Math.max(targetStock(p) - p.qty, 1);

  const salesInMonth = key => db.sales.filter(s => s.date.startsWith(key));

  function monthStats(key, untilDay = 31) {
    const list = salesInMonth(key).filter(s => Number(s.date.slice(8, 10)) <= untilDay);
    const revenue = sum(list, s => s.total);
    const profit = sum(list, s => s.profit);
    return {
      key, count: list.length, revenue, profit, cost: revenue - profit,
      items: sum(list, s => sum(s.items, i => i.qty)),
      ticket: list.length ? revenue / list.length : 0
    };
  }

  function dailyRate(productId, days = 30) {
    const since = Date.now() - days * 864e5;
    let q = 0;
    db.sales.forEach(s => {
      if (new Date(s.date).getTime() >= since) s.items.forEach(i => { if (i.productId === productId) q += i.qty; });
    });
    return q / days;
  }

  function daysLeft(p) {
    if (p.qty <= 0) return -1;
    const rate = dailyRate(p.id);
    return rate > 0 ? Math.floor(p.qty / rate) : null;
  }

  const daysLeftText = d => (d === null ? '<span class="muted">Sem vendas recentes</span>' : d < 0 ? '<span class="text-danger">Esgotado</span>' : d === 0 ? '<span class="text-danger">Menos de 1 dia</span>' : `<span class="${d <= 7 ? 'text-warning' : ''}">~${d} dia${d > 1 ? 's' : ''}</span>`);

  function registerEntry(p, qty, cost, date, note, updateCost = true) {
    p.qty += qty;
    if (updateCost && cost > 0) p.cost = cost;
    db.entries.push({ id: uid(), productId: p.id, name: p.name, qty, cost, date: date || localISO(), note: note || '' });
  }

  /* ===================== UI: toast, modal, componentes ===================== */
  function toast(msg, type = 'success', ms = 3800) {
    const icons = { success: 'circle-check', error: 'circle-xmark', warning: 'triangle-exclamation', info: 'circle-info' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fa-solid fa-${icons[type]}"></i><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 300); }, ms);
  }

  function openModal(title, html, { wide = false } = {}) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modal .modal').classList.toggle('wide', wide);
    $('#modal').classList.add('open');
    const first = $('#modalBody input:not([type="checkbox"]), #modalBody select');
    if (first) setTimeout(() => first.focus(), 60);
  }

  const closeModal = () => $('#modal').classList.remove('open');

  function confirmDialog(msg, onYes, { danger = true, yes = 'Confirmar' } = {}) {
    openModal('Confirmação', `
      <p class="confirm-text">${esc(msg)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmYes">${esc(yes)}</button>
      </div>`);
    $('#confirmYes').onclick = () => { closeModal(); onYes(); };
  }

  const empty = (icon, title, text, extra = '', cls = '') => `
    <div class="empty ${cls}">
      <div class="empty-icon"><i class="fa-solid ${icon}"></i></div>
      <strong>${title}</strong><p>${text}</p>${extra}
    </div>`;

  const kpi = (title, value, change, icon, color, foot = '') => `
    <div class="kpi">
      <div class="kpi-icon ${color}"><i class="fa-solid ${icon}"></i></div>
      <div class="kpi-body">
        <span class="kpi-title">${title}</span>
        <strong class="kpi-value" title="${esc(value)}">${value}</strong>
        <div class="kpi-foot">
          ${change === null ? '' : `<span class="trend ${change >= 0 ? 'up' : 'down'}"><i class="fa-solid fa-arrow-${change >= 0 ? 'up' : 'down'}"></i>${pct(change)}</span>`}
          <span>${foot}</span>
        </div>
      </div>
    </div>`;

  const avatar = (name, sm = false) => `<div class="prod-avatar ${sm ? 'sm' : ''}" style="--h:${hue(name)}">${esc(String(name).charAt(0).toUpperCase())}</div>`;

  function stockBadge(p) {
    const map = { out: ['danger', 'Esgotado'], low: ['danger', 'Repor'], warn: ['warning', 'Atenção'], ok: ['success', 'Em dia'] };
    const [cls, label] = map[stockStatus(p)];
    return `<span class="badge badge-${cls}">${label}</span>`;
  }

  function stockBar(p) {
    const w = Math.min(100, (p.qty / Math.max(targetStock(p), 1)) * 100);
    return `<div class="stock-cell">
      <div class="stock-top"><b>${num(p.qty)} un.</b>${stockBadge(p)}</div>
      <div class="bar"><span class="bar-${stockStatus(p)}" style="width:${w}%"></span></div>
    </div>`;
  }

  function productOptions(selected = '') {
    return '<option value="">Selecione um produto...</option>' + [...db.products]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(p => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)} — ${num(p.qty)} em estoque</option>`)
      .join('');
  }

  /* ===================== Gráficos ===================== */
  let charts = [];
  const destroyCharts = () => { charts.forEach(c => c.destroy()); charts = []; };

  function chartColors() {
    const cs = getComputedStyle(document.documentElement);
    return { text: cs.getPropertyValue('--text-muted').trim(), grid: cs.getPropertyValue('--border').trim(), surface: cs.getPropertyValue('--surface').trim() };
  }

  function makeChart(canvas, config) {
    if (!window.Chart || !canvas) return null;
    const c = new Chart(canvas, config);
    charts.push(c);
    return c;
  }

  function baseOptions(isMoney = true) {
    const c = chartColors();
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: c.text, usePointStyle: true, boxWidth: 8, padding: 16 } },
        tooltip: {
          padding: 12, cornerRadius: 10,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${isMoney ? money(ctx.parsed.y) : num(ctx.parsed.y)}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text } },
        y: { beginAtZero: true, grid: { color: c.grid }, border: { display: false }, ticks: { color: c.text, callback: v => (isMoney ? 'R$ ' + num(v) : num(v)) } }
      }
    };
  }

  const barGradient = (from, to) => ctx => {
    const { chart } = ctx;
    if (!chart.chartArea) return from;
    const g = chart.ctx.createLinearGradient(0, chart.chartArea.bottom, 0, chart.chartArea.top);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  };

  const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#14b8a6', '#f97316'];

  function doughnut(canvas, labels, data, isMoney = false) {
    const c = chartColors();
    return makeChart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: PALETTE, borderColor: c.surface, borderWidth: 3, hoverOffset: 8 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { color: c.text, usePointStyle: true, boxWidth: 8, padding: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${isMoney ? money(ctx.parsed) : num(ctx.parsed) + ' un.'}` } }
        }
      }
    });
  }

  /* ===================== Insights automáticos ===================== */
  function buildInsights() {
    const out = [];
    if (!db.sales.length) {
      return [{ type: 'info', icon: 'lightbulb', text: 'Registre suas vendas para receber análises automáticas sobre o seu negócio.' }];
    }
    const now = new Date();
    const cur = monthKey(now);
    const prev = shiftMonth(cur, -1);
    const today = now.getDate();
    const s = monthStats(cur);

    // Mesmo período do mês anterior (comparação justa)
    const prevSame = sum(salesInMonth(prev).filter(x => Number(x.date.slice(8, 10)) <= today), x => x.total);
    if (s.revenue || prevSame) {
      const v = variation(s.revenue, prevSame);
      out.push(v >= 0
        ? { type: 'good', icon: 'arrow-trend-up', text: `Até o dia ${today}, você faturou <b>${pct(v)}</b> em relação ao mesmo período de ${monthName(prev)}.` }
        : { type: 'bad', icon: 'arrow-trend-down', text: `Até o dia ${today}, o faturamento está <b>${pct(v)}</b> abaixo de ${monthName(prev)}. Que tal uma promoção?` });
    }

    // Projeção do mês
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (s.revenue > 0) {
      out.push({ type: 'info', icon: 'wand-magic-sparkles', text: `No ritmo atual, a projeção de faturamento para ${monthName(cur)} é de <b>${money((s.revenue / today) * dim)}</b>.` });
    }

    // Produto campeão do mês
    const byProd = {};
    salesInMonth(cur).forEach(x => x.items.forEach(i => { byProd[i.name] = (byProd[i.name] || 0) + i.qty; }));
    const top = Object.entries(byProd).sort((a, b) => b[1] - a[1])[0];
    if (top) out.push({ type: 'good', icon: 'trophy', text: `<b>${esc(top[0])}</b> é o campeão de vendas do mês com <b>${num(top[1])}</b> unidades.` });

    // Acabam em breve
    const soon = db.products.filter(p => p.qty > p.min).map(p => ({ p, d: daysLeft(p) })).filter(x => x.d !== null && x.d <= 7).sort((a, b) => a.d - b.d);
    if (soon.length) out.push({ type: 'warn', icon: 'hourglass-half', text: `<b>${esc(soon[0].p.name)}</b> deve acabar em cerca de <b>${soon[0].d} dia(s)</b> no ritmo atual de vendas.` });

    // Melhor dia da semana (90 dias)
    const since = Date.now() - 90 * 864e5;
    const wd = Array(7).fill(0);
    db.sales.forEach(x => { const d = new Date(x.date); if (d.getTime() >= since) wd[d.getDay()] += x.total; });
    const best = wd.indexOf(Math.max(...wd));
    if (wd[best] > 0) out.push({ type: 'info', icon: 'calendar-check', text: `Seu melhor dia de vendas é <b>${WEEKDAYS[best]}</b>. Capriche no estoque antes dele!` });

    // Produtos parados
    const limit = Date.now() - 30 * 864e5;
    const stale = db.products.filter(p => p.qty > 0 && new Date(p.createdAt).getTime() < limit && dailyRate(p.id) === 0);
    if (stale.length) out.push({ type: 'warn', icon: 'snowflake', text: `${stale.length === 1 ? 'O produto' : 'Os produtos'} <b>${stale.slice(0, 3).map(p => esc(p.name)).join(', ')}</b> não ${stale.length === 1 ? 'vende' : 'vendem'} há mais de 30 dias. Considere uma promoção.` });

    // Melhor margem
    const bestMargin = db.products.filter(p => p.price > 0).sort((a, b) => (b.price - b.cost) / b.price - (a.price - a.cost) / a.price)[0];
    if (bestMargin) out.push({ type: 'good', icon: 'percent', text: `<b>${esc(bestMargin.name)}</b> tem a melhor margem: <b>${pctPlain(((bestMargin.price - bestMargin.cost) / bestMargin.price) * 100)}</b> de lucro por venda.` });

    return out.slice(0, 6);
  }

  /* ===================== Dashboard ===================== */
  function renderDashboard(el) {
    const cur = monthKey(new Date());
    const prev = shiftMonth(cur, -1);
    const s = monthStats(cur);
    const p = monthStats(prev, new Date().getDate());
    const stockCost = sum(db.products, x => x.qty * x.cost);
    const stockSale = sum(db.products, x => x.qty * x.price);
    const alerts = alertProducts();
    const h = new Date().getHours();
    const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const firstName = String(user.name || 'Visitante').split(' ')[0];
    const hasData = db.products.length > 0;

    el.innerHTML = `
      <div class="hero-banner">
        <div>
          <h2>${greet}, ${esc(firstName)}!</h2>
          <p>${!hasData ? 'Vamos começar? Cadastre seus produtos ou carregue dados de exemplo para conhecer o sistema.'
            : alerts.length ? `Você tem <b>${alerts.length}</b> produto(s) no estoque de emergência. Hora de repor!`
            : 'Seu estoque está em dia. Bom trabalho!'}</p>
        </div>
        <div class="hero-actions">
          ${hasData
            ? `<a href="#vendas" class="btn btn-light"><i class="fa-solid fa-cash-register"></i> Registrar venda</a>
               ${alerts.length ? '<a href="#reposicao" class="btn btn-outline-light"><i class="fa-solid fa-cart-shopping"></i> Ver reposição</a>' : '<a href="#produtos" class="btn btn-outline-light"><i class="fa-solid fa-plus"></i> Novo produto</a>'}`
            : `<a href="#produtos" class="btn btn-light"><i class="fa-solid fa-plus"></i> Cadastrar produto</a>
               <button class="btn btn-outline-light" id="demoBtn"><i class="fa-solid fa-wand-magic-sparkles"></i> Carregar exemplo</button>`}
        </div>
      </div>

      <div class="kpi-grid">
        ${kpi('Faturamento do mês', money(s.revenue), variation(s.revenue, p.revenue), 'fa-sack-dollar', 'violet', `vs mesmo período de ${monthLabel(prev)}`)}
        ${kpi('Lucro do mês', money(s.profit), variation(s.profit, p.profit), 'fa-chart-line', 'green', `vs mesmo período de ${monthLabel(prev)}`)}
        ${kpi('Vendas no mês', num(s.count), variation(s.count, p.count), 'fa-receipt', 'blue', `Ticket médio ${money(s.ticket)}`)}
        ${kpi('Valor em estoque', money(stockCost), null, 'fa-warehouse', 'orange', `Potencial de venda: ${money(stockSale)}`)}
      </div>

      <div class="grid-2-1">
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-chart-column"></i> Faturamento x Lucro</h3><span class="pill">Últimos 6 meses</span></div>
          <div class="chart-box"><canvas id="chRevenue"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-fire"></i> Mais vendidos</h3><span class="pill">${monthName(cur)}</span></div>
          <div class="chart-box sm" id="topBox"><canvas id="chTop"></canvas></div>
        </div>
      </div>

      <div class="grid-3">
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-lightbulb"></i> Insights</h3></div>
          <div class="insights">
            ${buildInsights().map(i => `<div class="insight ${i.type}"><i class="fa-solid fa-${i.icon}"></i><p>${i.text}</p></div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-triangle-exclamation"></i> Estoque de emergência</h3>${alerts.length ? '<a href="#reposicao" class="pill">Ver tudo</a>' : ''}</div>
          ${alerts.length ? `<div class="list">${alerts.slice(0, 6).map(x => `
            <a href="#reposicao" class="list-item">
              ${avatar(x.name, true)}
              <div class="grow"><strong>${esc(x.name)}</strong><small>${num(x.qty)} un. · emergência em ${num(x.min)}</small></div>
              ${stockBadge(x)}
            </a>`).join('')}</div>`
            : empty('fa-circle-check', 'Tudo certo!', 'Nenhum produto abaixo do limite de emergência.', '', 'success')}
        </div>
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-clock-rotate-left"></i> Últimas vendas</h3>${db.sales.length ? '<a href="#vendas" class="pill">Ver tudo</a>' : ''}</div>
          ${db.sales.length ? `<div class="list">${[...db.sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map(x => `
            <div class="list-item">
              <div class="kpi-icon green" style="width:36px;height:36px;font-size:14px;border-radius:10px"><i class="fa-solid fa-bag-shopping"></i></div>
              <div class="grow"><strong>${esc(x.items.map(i => `${i.qty}× ${i.name}`).join(', '))}</strong><small>${fmtDate(x.date)} · ${esc(x.payment)}</small></div>
              <b>${money(x.total)}</b>
            </div>`).join('')}</div>`
            : empty('fa-receipt', 'Nenhuma venda ainda', 'Suas vendas aparecerão aqui.')}
        </div>
      </div>`;

    const demoBtn = $('#demoBtn', el);
    if (demoBtn) demoBtn.onclick = askLoadDemo;

    // Gráfico de faturamento
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(cur, i - 5));
    const st = months.map(m => monthStats(m));
    const opts = baseOptions(true);
    makeChart($('#chRevenue'), {
      type: 'bar',
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: 'Lucro', type: 'line', data: st.map(x => r2(x.profit)), borderColor: '#10b981', backgroundColor: '#10b981', tension: .4, pointRadius: 4, pointHoverRadius: 6, borderWidth: 3, order: 0 },
          { label: 'Faturamento', data: st.map(x => r2(x.revenue)), backgroundColor: barGradient('rgba(99,102,241,.55)', '#8b5cf6'), borderRadius: 10, maxBarThickness: 42, order: 1 }
        ]
      },
      options: opts
    });

    // Mais vendidos
    const byProd = {};
    salesInMonth(cur).forEach(x => x.items.forEach(i => { byProd[i.name] = (byProd[i.name] || 0) + i.qty; }));
    const top = Object.entries(byProd).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (top.length) doughnut($('#chTop'), top.map(t => t[0]), top.map(t => t[1]));
    else $('#topBox').innerHTML = empty('fa-chart-pie', 'Sem vendas neste mês', 'Os produtos mais vendidos aparecerão aqui.');
  }

  /* ===================== Produtos ===================== */
  const state = { prodSearch: '', prodFilter: 'all', cart: [], salesMonth: 'all', reportPeriod: 'last12', entryProduct: '' };

  function renderProducts(el) {
    el.innerHTML = `
      <div class="toolbar">
        <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input id="prodSearch" type="search" placeholder="Buscar por nome, categoria ou descrição..." value="${esc(state.prodSearch)}"></div>
        <div class="chips" id="prodFilter">
          ${[['all', 'Todos'], ['alert', 'Em alerta'], ['ok', 'Em dia']].map(([k, l]) => `<button class="chip ${state.prodFilter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}
        </div>
        <button class="btn btn-primary" id="newProductBtn"><i class="fa-solid fa-plus"></i> Novo produto</button>
      </div>
      <div class="card no-pad">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Produto</th><th>Estoque</th><th>Emergência</th><th>Valor pago</th><th>Preço venda</th><th>Margem</th><th>Valor em estoque</th><th class="t-right">Ações</th></tr></thead>
            <tbody id="prodBody"></tbody>
          </table>
        </div>
      </div>`;

    const draw = () => {
      const q = state.prodSearch.trim().toLowerCase();
      const list = db.products
        .filter(p => !q || [p.name, p.category, p.description].join(' ').toLowerCase().includes(q))
        .filter(p => state.prodFilter === 'all' || (state.prodFilter === 'alert' ? p.qty <= p.min : p.qty > p.min))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      $('#prodBody').innerHTML = list.length ? list.map(p => {
        const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0;
        return `<tr>
          <td><div class="prod-cell">${avatar(p.name)}<div><strong>${esc(p.name)}</strong><small>${esc(p.category || 'Sem categoria')}${p.description ? ' · ' + esc(p.description) : ''}</small></div></div></td>
          <td>${stockBar(p)}</td>
          <td><span class="badge badge-neutral"><i class="fa-solid fa-bell"></i> ${num(p.min)}</span></td>
          <td>${money(p.cost)}</td>
          <td>${money(p.price)}</td>
          <td><span class="${margin >= 30 ? 'text-success' : margin >= 10 ? 'text-warning' : 'text-danger'}">${pctPlain(margin)}</span></td>
          <td>${money(p.qty * p.cost)}</td>
          <td class="t-right"><div class="row-actions">
            <button class="icon-btn sm" data-act="entry" data-id="${esc(p.id)}" title="Dar entrada"><i class="fa-solid fa-plus"></i></button>
            <button class="icon-btn sm" data-act="edit" data-id="${esc(p.id)}" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn sm danger" data-act="del" data-id="${esc(p.id)}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`;
      }).join('') : `<tr><td colspan="8">${db.products.length
        ? empty('fa-magnifying-glass', 'Nenhum produto encontrado', 'Tente outra busca ou filtro.')
        : empty('fa-box-open', 'Nenhum produto cadastrado', 'Cadastre seu primeiro produto para começar a controlar o estoque.', '<button class="btn btn-primary" data-act="new"><i class="fa-solid fa-plus"></i> Cadastrar produto</button>')}</td></tr>`;
    };

    draw();
    $('#prodSearch').oninput = e => { state.prodSearch = e.target.value; draw(); };
    $('#prodFilter').onclick = e => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      state.prodFilter = b.dataset.f;
      $$('.chip', el).forEach(c => c.classList.toggle('active', c === b));
      draw();
    };
    $('#newProductBtn').onclick = () => productForm();
    $('#prodBody').onclick = e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'new') return productForm();
      const p = getProduct(b.dataset.id);
      if (!p) return;
      if (b.dataset.act === 'edit') productForm(p);
      else if (b.dataset.act === 'entry') { state.entryProduct = p.id; location.hash = '#entradas'; }
      else confirmDialog(`Excluir "${p.name}"? O histórico de vendas e entradas será mantido.`, () => {
        db.products = db.products.filter(x => x.id !== p.id);
        state.cart = state.cart.filter(i => i.productId !== p.id);
        save();
        toast('Produto excluído.');
        rerender();
      }, { yes: 'Excluir' });
    };
  }

  function productForm(p) {
    const e = p || { name: '', category: '', description: '', cost: '', price: '', qty: '', min: '', ideal: '' };
    const cats = [...new Set(db.products.map(x => x.category).filter(Boolean))];
    openModal(p ? 'Editar produto' : 'Novo produto', `
      <form id="prodForm" class="form-grid" novalidate>
        <label class="span-2">Nome do produto *<input name="name" required maxlength="80" value="${esc(e.name)}" placeholder="Ex: Fone de ouvido Bluetooth"></label>
        <label>Categoria
          <input name="category" list="catList" maxlength="40" value="${esc(e.category)}" placeholder="Ex: Eletrônicos">
          <datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
        </label>
        <label>Quantidade ${p ? 'em estoque' : 'que entrou'} *<input name="qty" type="number" min="0" step="1" required value="${esc(e.qty)}" placeholder="0"></label>
        <label class="span-2">Descrição<textarea name="description" rows="2" maxlength="300" placeholder="Detalhes do produto (opcional)">${esc(e.description)}</textarea></label>
        <label>Valor pago (unitário) *<div class="input-prefix"><span>R$</span><input name="cost" type="number" min="0" step="0.01" required value="${esc(e.cost)}" placeholder="0,00"></div></label>
        <label>Preço de venda *<div class="input-prefix"><span>R$</span><input name="price" type="number" min="0" step="0.01" required value="${esc(e.price)}" placeholder="0,00"></div></label>
        <label>Número de emergência *<input name="min" type="number" min="0" step="1" required value="${esc(e.min)}" placeholder="Ex: 5"><small>Você será alertado quando o estoque chegar nesse número.</small></label>
        <label>Estoque ideal<input name="ideal" type="number" min="0" step="1" value="${e.ideal ? esc(e.ideal) : ''}" placeholder="Opcional"><small>Usado para sugerir quanto comprar na reposição.</small></label>
        <div class="span-2 preview" id="prodPreview"></div>
        <div class="modal-actions span-2">
          <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
          <button class="btn btn-primary"><i class="fa-solid fa-check"></i> ${p ? 'Salvar alterações' : 'Cadastrar produto'}</button>
        </div>
      </form>`, { wide: true });

    const f = $('#prodForm');
    const F = f.elements;
    const preview = () => {
      const c = +F.cost.value || 0, v = +F.price.value || 0, q = +F.qty.value || 0;
      const m = v > 0 ? ((v - c) / v) * 100 : 0;
      $('#prodPreview').innerHTML = `
        <div><span>Lucro por unidade</span><b class="${v - c >= 0 ? 'text-success' : 'text-danger'}">${money(v - c)}</b></div>
        <div><span>Margem</span><b>${pctPlain(m)}</b></div>
        <div><span>Investimento em estoque</span><b>${money(q * c)}</b></div>`;
    };
    f.oninput = preview;
    preview();

    f.onsubmit = ev => {
      ev.preventDefault();
      const data = {
        name: F.name.value.trim(),
        category: F.category.value.trim(),
        description: F.description.value.trim(),
        cost: r2(F.cost.value),
        price: r2(F.price.value),
        qty: Math.floor(+F.qty.value),
        min: Math.floor(+F.min.value),
        ideal: Math.floor(+F.ideal.value) || 0
      };
      if (!data.name) return toast('Informe o nome do produto.', 'error');
      if (F.qty.value === '' || data.qty < 0) return toast('Informe a quantidade.', 'error');
      if (F.cost.value === '' || data.cost < 0) return toast('Informe o valor pago.', 'error');
      if (F.price.value === '' || data.price < 0) return toast('Informe o preço de venda.', 'error');
      if (F.min.value === '' || data.min < 0) return toast('Informe o número de emergência.', 'error');
      if (db.products.some(x => x.name.toLowerCase() === data.name.toLowerCase() && x.id !== p?.id)) return toast('Já existe um produto com esse nome.', 'error');
      if (data.price < data.cost) toast('Atenção: o preço de venda está menor que o valor pago.', 'warning');

      let target = p;
      if (p) {
        Object.assign(p, data);
        toast('Produto atualizado.');
      } else {
        target = { id: uid(), createdAt: localISO(), ...data, qty: 0 };
        db.products.push(target);
        if (data.qty > 0) registerEntry(target, data.qty, data.cost, localISO(), 'Estoque inicial');
        toast('Produto cadastrado!');
      }
      save();
      closeModal();
      rerender();
      if (target.qty <= target.min) toast(`"${target.name}" já está no estoque de emergência.`, 'warning');
    };
  }

  /* ===================== Entradas ===================== */
  function renderEntries(el) {
    const cur = monthKey(new Date());
    const invested = sum(db.entries.filter(e => e.date.startsWith(cur)), e => e.qty * e.cost);
    const list = [...db.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150);
    const pre = state.entryProduct;
    state.entryProduct = '';

    el.innerHTML = `
      <div class="grid-1-2">
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-truck-ramp-box"></i> Registrar entrada</h3></div>
          ${db.products.length ? `
          <form id="entryForm" class="form-grid">
            <label class="span-2">Produto *<select name="product" required>${productOptions(pre)}</select></label>
            <label>Quantidade *<input name="qty" type="number" min="1" step="1" required placeholder="0"></label>
            <label>Valor pago (unit.) *<div class="input-prefix"><span>R$</span><input name="cost" type="number" min="0" step="0.01" required placeholder="0,00"></div></label>
            <label class="span-2">Data<input name="date" type="datetime-local" value="${localISO()}"></label>
            <label class="span-2">Fornecedor / observação<input name="note" maxlength="120" placeholder="Opcional"></label>
            <label class="check span-2"><input type="checkbox" name="updateCost" checked> Atualizar o valor pago do produto</label>
            <div class="total-box span-2"><span>Total da compra</span><b id="entryTotal">R$ 0,00</b></div>
            <button class="btn btn-primary span-2"><i class="fa-solid fa-check"></i> Registrar entrada</button>
          </form>
          <p class="muted" style="margin-top:14px;font-size:12px">Produto novo? <a href="#" id="entryNewProd">Cadastre aqui</a>.</p>`
          : empty('fa-box-open', 'Nenhum produto cadastrado', 'Cadastre um produto antes de registrar entradas.', '<a href="#produtos" class="btn btn-primary">Ir para produtos</a>')}
        </div>

        <div class="card no-pad">
          <div class="card-header pad"><h3><i class="fa-solid fa-list"></i> Histórico de entradas</h3><span class="pill">Investido em ${monthName(cur)}: <b>${money(invested)}</b></span></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Valor unit.</th><th>Total</th><th>Observação</th><th></th></tr></thead>
              <tbody id="entryBody">
                ${list.length ? list.map(e => `<tr>
                  <td>${fmtDate(e.date)}</td>
                  <td><strong>${esc(e.name)}</strong></td>
                  <td><span class="badge badge-success">+${num(e.qty)}</span></td>
                  <td>${money(e.cost)}</td>
                  <td><b>${money(e.qty * e.cost)}</b></td>
                  <td class="wrap muted">${esc(e.note) || '-'}</td>
                  <td class="t-right"><button class="icon-btn sm danger" data-del="${esc(e.id)}" title="Excluir entrada"><i class="fa-solid fa-trash"></i></button></td>
                </tr>`).join('') : `<tr><td colspan="7">${empty('fa-truck', 'Nenhuma entrada registrada', 'As compras de mercadoria aparecerão aqui.')}</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

    const newLink = $('#entryNewProd');
    if (newLink) newLink.onclick = e => { e.preventDefault(); productForm(); };

    const f = $('#entryForm');
    if (f) {
      const F = f.elements;
      const fillCost = () => { const p = getProduct(F.product.value); if (p) F.cost.value = p.cost; if (p && !F.qty.value) F.qty.value = p.qty <= p.min ? suggestedQty(p) : ''; calc(); };
      const calc = () => { $('#entryTotal').textContent = money((+F.qty.value || 0) * (+F.cost.value || 0)); };
      F.product.onchange = fillCost;
      f.oninput = calc;
      if (pre) fillCost();
      f.onsubmit = ev => {
        ev.preventDefault();
        const p = getProduct(F.product.value);
        const qty = Math.floor(+F.qty.value);
        const cost = r2(F.cost.value);
        if (!p) return toast('Selecione um produto.', 'error');
        if (!(qty > 0)) return toast('Informe uma quantidade válida.', 'error');
        if (F.cost.value === '' || cost < 0) return toast('Informe o valor pago.', 'error');
        registerEntry(p, qty, cost, F.date.value || localISO(), F.note.value.trim(), F.updateCost.checked);
        save();
        toast(`Entrada registrada: +${qty} ${p.name} (${money(qty * cost)})`);
        rerender();
      };
    }

    $('#entryBody').onclick = e => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      const entry = db.entries.find(x => x.id === b.dataset.del);
      if (!entry) return;
      const p = getProduct(entry.productId);
      if (p && p.qty - entry.qty < 0) return toast('Não é possível excluir: parte dessas unidades já foi vendida.', 'error');
      confirmDialog(`Excluir esta entrada de ${entry.qty} un. de "${entry.name}"?${p ? ' O estoque será ajustado.' : ''}`, () => {
        if (p) p.qty -= entry.qty;
        db.entries = db.entries.filter(x => x.id !== entry.id);
        save();
        toast('Entrada excluída.');
        rerender();
      }, { yes: 'Excluir' });
    };
  }

  /* ===================== Vendas ===================== */
  function renderSales(el) {
    state.cart = state.cart.filter(i => getProduct(i.productId));
    const months = [...new Set(db.sales.map(s => s.date.slice(0, 7)))].sort().reverse();
    if (state.salesMonth !== 'all' && !months.includes(state.salesMonth)) state.salesMonth = 'all';
    const filtered = db.sales.filter(s => state.salesMonth === 'all' || s.date.startsWith(state.salesMonth)).sort((a, b) => b.date.localeCompare(a.date));

    el.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-barcode"></i> Adicionar produto</h3></div>
          ${db.products.length ? `
          <form id="addItemForm" class="form-grid">
            <label class="span-2">Produto *<select name="product" required>${productOptions()}</select><span class="stock-hint" id="stockHint"></span></label>
            <label>Quantidade *<input name="qty" type="number" min="1" step="1" value="1" required></label>
            <label>Preço unitário *<div class="input-prefix"><span>R$</span><input name="price" type="number" min="0" step="0.01" required placeholder="0,00"></div></label>
            <div class="total-box span-2"><span>Subtotal do item</span><b id="itemTotal">R$ 0,00</b></div>
            <button class="btn btn-primary span-2"><i class="fa-solid fa-cart-plus"></i> Adicionar ao carrinho</button>
          </form>`
          : empty('fa-box-open', 'Nenhum produto cadastrado', 'Cadastre produtos para começar a vender.', '<a href="#produtos" class="btn btn-primary">Ir para produtos</a>')}
        </div>

        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-cart-shopping"></i> Carrinho</h3>${state.cart.length ? '<button class="pill" id="clearCart">Limpar</button>' : ''}</div>
          <div class="cart-list" id="cartList"></div>
          <div class="form-grid">
            <label>Forma de pagamento<select id="payMethod">${PAYMENTS.map(p => `<option>${p}</option>`).join('')}</select></label>
            <label>Desconto<div class="input-prefix"><span>R$</span><input id="discount" type="number" min="0" step="0.01" placeholder="0,00"></div></label>
            <label>Cliente<input id="customer" maxlength="60" placeholder="Opcional"></label>
            <label>Data da venda<input id="saleDate" type="datetime-local" value="${localISO()}"></label>
          </div>
          <div class="cart-summary" style="margin-top:16px">
            <div class="sum-row"><span>Subtotal</span><span id="sumSub">R$ 0,00</span></div>
            <div class="sum-row"><span>Desconto</span><span id="sumDisc">- R$ 0,00</span></div>
            <div class="sum-row"><span>Lucro estimado</span><span id="sumProfit" class="text-success">R$ 0,00</span></div>
            <div class="sum-row total"><span>Total</span><b id="sumTotal">R$ 0,00</b></div>
            <button class="btn btn-success btn-lg btn-block" id="finishSale"><i class="fa-solid fa-circle-check"></i> Finalizar venda</button>
          </div>
        </div>
      </div>

      <div class="card no-pad">
        <div class="card-header pad">
          <h3><i class="fa-solid fa-receipt"></i> Histórico de vendas</h3>
          <div style="display:flex;gap:10px;align-items:center">
            <span class="pill">${filtered.length} venda(s) · ${money(sum(filtered, s => s.total))}</span>
            <select id="salesMonth" style="width:auto">
              <option value="all">Todos os meses</option>
              ${months.map(m => `<option value="${m}" ${state.salesMonth === m ? 'selected' : ''}>${monthName(m)} de ${m.slice(0, 4)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="table-wrap" style="margin-top:16px">
          <table class="table">
            <thead><tr><th>Data</th><th>Itens</th><th>Cliente</th><th>Pagamento</th><th>Total</th><th>Lucro</th><th class="t-right">Ações</th></tr></thead>
            <tbody id="salesBody">
              ${filtered.length ? filtered.slice(0, 200).map(s => `<tr>
                <td>${fmtDate(s.date)}</td>
                <td class="wrap">${esc(s.items.map(i => `${i.qty}× ${i.name}`).join(', '))}</td>
                <td>${esc(s.customer) || '<span class="muted">-</span>'}</td>
                <td><span class="badge badge-info">${esc(s.payment)}</span></td>
                <td><b>${money(s.total)}</b></td>
                <td class="${s.profit >= 0 ? 'text-success' : 'text-danger'}">${money(s.profit)}</td>
                <td class="t-right"><div class="row-actions">
                  <button class="icon-btn sm" data-view="${esc(s.id)}" title="Detalhes"><i class="fa-solid fa-eye"></i></button>
                  <button class="icon-btn sm danger" data-del="${esc(s.id)}" title="Excluir venda"><i class="fa-solid fa-trash"></i></button>
                </div></td>
              </tr>`).join('') : `<tr><td colspan="7">${empty('fa-receipt', 'Nenhuma venda registrada', 'Adicione produtos ao carrinho e finalize sua primeira venda.')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    const drawCart = () => {
      $('#cartList').innerHTML = state.cart.length ? state.cart.map((it, idx) => {
        const p = getProduct(it.productId);
        return `<div class="cart-item">
          ${avatar(p.name, true)}
          <div class="ci-info"><strong>${esc(p.name)}</strong><small>${num(it.qty)} × ${money(it.price)}</small></div>
          <b>${money(it.qty * it.price)}</b>
          <button class="icon-btn sm danger" data-rm="${idx}" title="Remover"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
      }).join('') : empty('fa-cart-shopping', 'Carrinho vazio', 'Adicione produtos para registrar a venda.');
      calcTotals();
    };

    const calcTotals = () => {
      const sub = sum(state.cart, i => i.qty * i.price);
      const disc = Math.min(Math.max(+$('#discount').value || 0, 0), sub);
      const profit = sum(state.cart, i => i.qty * (i.price - getProduct(i.productId).cost)) - disc;
      $('#sumSub').textContent = money(sub);
      $('#sumDisc').textContent = '- ' + money(disc);
      $('#sumProfit').textContent = money(profit);
      $('#sumTotal').textContent = money(sub - disc);
      $('#finishSale').disabled = !state.cart.length;
    };

    drawCart();
    $('#discount').oninput = calcTotals;
    $('#cartList').onclick = e => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      state.cart.splice(+b.dataset.rm, 1);
      drawCart();
    };
    const clear = $('#clearCart');
    if (clear) clear.onclick = () => { state.cart = []; rerender(); };

    const f = $('#addItemForm');
    if (f) {
      const F = f.elements;
      const inCart = id => sum(state.cart.filter(i => i.productId === id), i => i.qty);
      const calcItem = () => { $('#itemTotal').textContent = money((+F.qty.value || 0) * (+F.price.value || 0)); };
      F.product.onchange = () => {
        const p = getProduct(F.product.value);
        F.price.value = p ? p.price : '';
        $('#stockHint').innerHTML = p ? `Disponível: <b>${num(p.qty - inCart(p.id))}</b> un. ${p.qty <= p.min ? '· <span class="text-danger">estoque de emergência</span>' : ''}` : '';
        calcItem();
      };
      f.oninput = calcItem;
      f.onsubmit = ev => {
        ev.preventDefault();
        const p = getProduct(F.product.value);
        const qty = Math.floor(+F.qty.value);
        const price = r2(F.price.value);
        if (!p) return toast('Selecione um produto.', 'error');
        if (!(qty > 0)) return toast('Informe uma quantidade válida.', 'error');
        if (F.price.value === '' || price < 0) return toast('Informe o preço.', 'error');
        const available = p.qty - inCart(p.id);
        if (qty > available) return toast(`Estoque insuficiente. Disponível: ${available} un. de ${p.name}.`, 'error');
        const same = state.cart.find(i => i.productId === p.id && i.price === price);
        if (same) same.qty += qty; else state.cart.push({ productId: p.id, qty, price });
        F.product.value = '';
        F.qty.value = 1;
        F.price.value = '';
        $('#stockHint').innerHTML = '';
        calcItem();
        drawCart();
        F.product.focus();
      };
    }

    $('#finishSale').onclick = () => {
      if (!state.cart.length) return;
      for (const it of state.cart) {
        const p = getProduct(it.productId);
        const total = sum(state.cart.filter(i => i.productId === it.productId), i => i.qty);
        if (!p || total > p.qty) return toast(`Estoque insuficiente para ${p ? p.name : 'um produto'}.`, 'error');
      }
      const items = state.cart.map(it => { const p = getProduct(it.productId); return { productId: p.id, name: p.name, qty: it.qty, price: it.price, cost: p.cost }; });
      const subtotal = r2(sum(items, i => i.qty * i.price));
      const discount = r2(Math.min(Math.max(+$('#discount').value || 0, 0), subtotal));
      const sale = {
        id: uid(),
        date: $('#saleDate').value || localISO(),
        items,
        subtotal,
        discount,
        total: r2(subtotal - discount),
        profit: r2(sum(items, i => i.qty * (i.price - i.cost)) - discount),
        payment: $('#payMethod').value,
        customer: $('#customer').value.trim()
      };
      const reached = [];
      items.forEach(i => {
        const p = getProduct(i.productId);
        p.qty -= i.qty;
        if (p.qty <= p.min && !reached.includes(p)) reached.push(p);
      });
      db.sales.push(sale);
      state.cart = [];
      save();
      toast(`Venda registrada: ${money(sale.total)}`);
      reached.forEach((p, i) => setTimeout(() => toast(`"${p.name}" ${p.qty <= 0 ? 'esgotou' : `chegou a ${p.qty} un.`} — estoque de emergência! Hora de repor.`, 'warning', 6000), 400 * (i + 1)));
      rerender();
    };

    $('#salesMonth').onchange = e => { state.salesMonth = e.target.value; rerender(); };

    $('#salesBody').onclick = e => {
      const v = e.target.closest('[data-view]');
      const d = e.target.closest('[data-del]');
      if (v) {
        const s = db.sales.find(x => x.id === v.dataset.view);
        if (s) saleDetails(s);
      } else if (d) {
        const s = db.sales.find(x => x.id === d.dataset.del);
        if (!s) return;
        confirmDialog(`Excluir a venda de ${money(s.total)}? Os produtos voltarão para o estoque.`, () => {
          s.items.forEach(i => { const p = getProduct(i.productId); if (p) p.qty += i.qty; });
          db.sales = db.sales.filter(x => x.id !== s.id);
          save();
          toast('Venda excluída e estoque devolvido.');
          rerender();
        }, { yes: 'Excluir venda' });
      }
    };
  }

  function saleDetails(s) {
    openModal('Detalhes da venda', `
      <div class="list" style="margin-bottom:16px">
        <div class="list-item"><div class="grow"><small>Data</small><strong>${fmtDate(s.date)}</strong></div><div class="grow"><small>Pagamento</small><strong>${esc(s.payment)}</strong></div></div>
        ${s.customer ? `<div class="list-item"><div class="grow"><small>Cliente</small><strong>${esc(s.customer)}</strong></div></div>` : ''}
      </div>
      <div class="table-wrap" style="border:1px solid var(--border);border-radius:12px">
        <table class="table">
          <thead><tr><th>Produto</th><th>Qtd</th><th>Preço</th><th class="t-right">Total</th></tr></thead>
          <tbody>${s.items.map(i => `<tr><td>${esc(i.name)}</td><td>${num(i.qty)}</td><td>${money(i.price)}</td><td class="t-right">${money(i.qty * i.price)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="cart-summary" style="margin-top:16px">
        <div class="sum-row"><span>Subtotal</span><span>${money(s.subtotal)}</span></div>
        <div class="sum-row"><span>Desconto</span><span>- ${money(s.discount)}</span></div>
        <div class="sum-row"><span>Lucro</span><span class="text-success">${money(s.profit)}</span></div>
        <div class="sum-row total"><span>Total</span><b>${money(s.total)}</b></div>
      </div>`);
  }

  /* ===================== Reposição ===================== */
  function renderRestock(el) {
    const list = alertProducts();
    const watch = db.products
      .filter(p => p.qty > p.min)
      .map(p => ({ p, d: daysLeft(p) }))
      .filter(x => stockStatus(x.p) === 'warn' || (x.d !== null && x.d <= 7));

    el.innerHTML = `
      <div class="kpi-grid three">
        ${kpi('Produtos para repor', num(list.length), null, 'fa-triangle-exclamation', 'red', 'No estoque de emergência')}
        ${kpi('Unidades a comprar', '<span id="rsUnits">0</span>', null, 'fa-boxes-stacked', 'blue', 'Quantidade sugerida (editável)')}
        ${kpi('Valor total da compra', '<span id="rsTotal">R$ 0,00</span>', null, 'fa-money-bill-wave', 'violet', 'Baseado no valor que você pagou')}
      </div>

      <div class="card no-pad mb">
        <div class="card-header pad">
          <h3><i class="fa-solid fa-cart-shopping"></i> Lista de compras</h3>
          ${list.length ? `<div class="setting-actions no-print">
            <button class="btn btn-ghost btn-sm" id="rsCopy"><i class="fa-regular fa-copy"></i> Copiar</button>
            <button class="btn btn-whats btn-sm" id="rsWhats"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
            <button class="btn btn-ghost btn-sm" id="rsPrint"><i class="fa-solid fa-print"></i> Imprimir</button>
            <button class="btn btn-primary btn-sm" id="rsBuyAll"><i class="fa-solid fa-check-double"></i> Registrar todas</button>
          </div>` : ''}
        </div>
        <div class="table-wrap" style="margin-top:16px">
          <table class="table">
            <thead><tr><th>Produto</th><th>Estoque</th><th>Emergência</th><th>Dura</th><th>Comprar</th><th>Valor pago (unit.)</th><th>Subtotal</th><th class="t-right no-print"></th></tr></thead>
            <tbody id="rsBody">
              ${list.length ? list.map(p => `<tr data-id="${esc(p.id)}">
                <td><div class="prod-cell">${avatar(p.name, true)}<div><strong>${esc(p.name)}</strong><small>${esc(p.category || 'Sem categoria')}</small></div></div></td>
                <td>${stockBar(p)}</td>
                <td>${num(p.min)} un.</td>
                <td>${daysLeftText(daysLeft(p))}</td>
                <td><input class="mini-input rs-qty" type="number" min="1" step="1" value="${suggestedQty(p)}"></td>
                <td><div class="input-prefix"><span>R$</span><input class="mini-input rs-cost" type="number" min="0" step="0.01" value="${p.cost}"></div></td>
                <td><b class="rs-sub">${money(suggestedQty(p) * p.cost)}</b></td>
                <td class="t-right no-print"><button class="btn btn-success btn-sm" data-buy="${esc(p.id)}"><i class="fa-solid fa-check"></i> Comprei</button></td>
              </tr>`).join('') : `<tr><td colspan="8">${empty('fa-circle-check', 'Nenhum produto precisa de reposição', 'Todos os produtos estão acima do número de emergência.', '', 'success')}</td></tr>`}
            </tbody>
            ${list.length ? `<tfoot><tr><td colspan="6">Total a pagar</td><td colspan="2" id="rsFootTotal">R$ 0,00</td></tr></tfoot>` : ''}
          </table>
        </div>
      </div>

      ${watch.length ? `
      <div class="card no-pad">
        <div class="card-header pad"><h3><i class="fa-solid fa-eye"></i> Fique de olho</h3><span class="pill">Perto do limite ou acabando em até 7 dias</span></div>
        <div class="table-wrap" style="margin-top:16px">
          <table class="table">
            <thead><tr><th>Produto</th><th>Estoque</th><th>Emergência</th><th>Previsão para acabar</th></tr></thead>
            <tbody>${watch.map(({ p, d }) => `<tr>
              <td><div class="prod-cell">${avatar(p.name, true)}<div><strong>${esc(p.name)}</strong><small>${esc(p.category || 'Sem categoria')}</small></div></div></td>
              <td>${stockBar(p)}</td><td>${num(p.min)} un.</td><td>${daysLeftText(d)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>` : ''}`;

    if (!list.length) { $('#rsUnits').textContent = '0'; return; }

    const rows = () => $$('#rsBody tr[data-id]').map(tr => ({
      tr, p: getProduct(tr.dataset.id),
      qty: Math.max(Math.floor(+$('.rs-qty', tr).value) || 0, 0),
      cost: Math.max(r2($('.rs-cost', tr).value), 0)
    }));

    const recalc = () => {
      let units = 0, total = 0;
      rows().forEach(r => {
        $('.rs-sub', r.tr).textContent = money(r.qty * r.cost);
        units += r.qty;
        total += r.qty * r.cost;
      });
      $('#rsUnits').textContent = num(units);
      $('#rsTotal').textContent = money(total);
      $('#rsFootTotal').textContent = money(total);
    };
    recalc();
    $('#rsBody').oninput = recalc;

    const listText = () => {
      const r = rows().filter(x => x.qty > 0);
      return `*Lista de compras — ${db.settings.storeName}*\n${new Date().toLocaleDateString('pt-BR')}\n\n` +
        r.map(x => `• ${x.p.name}: ${x.qty} un. × ${money(x.cost)} = ${money(x.qty * x.cost)}`).join('\n') +
        `\n\n*Total: ${money(sum(r, x => x.qty * x.cost))}*`;
    };

    $('#rsCopy').onclick = () => {
      navigator.clipboard.writeText(listText().replace(/\*/g, ''))
        .then(() => toast('Lista copiada para a área de transferência.'))
        .catch(() => toast('Não foi possível copiar.', 'error'));
    };
    $('#rsWhats').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(listText()), '_blank', 'noopener');
    $('#rsPrint').onclick = () => window.print();

    const buy = items => {
      items.forEach(r => registerEntry(r.p, r.qty, r.cost, localISO(), 'Reposição'));
      save();
      toast(items.length === 1
        ? `Compra registrada: +${items[0].qty} ${items[0].p.name} (${money(items[0].qty * items[0].cost)})`
        : `${items.length} compras registradas: ${money(sum(items, r => r.qty * r.cost))}`);
      rerender();
    };

    $('#rsBody').onclick = e => {
      const b = e.target.closest('[data-buy]');
      if (!b) return;
      const r = rows().find(x => x.p.id === b.dataset.buy);
      if (!r || r.qty <= 0) return toast('Informe a quantidade comprada.', 'error');
      buy([r]);
    };

    $('#rsBuyAll').onclick = () => {
      const r = rows().filter(x => x.qty > 0);
      if (!r.length) return toast('Nenhuma quantidade informada.', 'error');
      confirmDialog(`Registrar a compra de ${r.length} produto(s) no valor total de ${money(sum(r, x => x.qty * x.cost))}?`, () => buy(r), { danger: false, yes: 'Registrar compras' });
    };
  }

  /* ===================== Relatórios ===================== */
  function renderReports(el) {
    const curKey = monthKey(new Date());
    const years = [...new Set(db.sales.map(s => s.date.slice(0, 4)).concat(String(new Date().getFullYear())))].sort().reverse();
    const period = state.reportPeriod;
    const months = period === 'last12'
      ? Array.from({ length: 12 }, (_, i) => shiftMonth(curKey, i - 11))
      : Array.from({ length: 12 }, (_, i) => `${period}-${pad(i + 1)}`);
    const stats = months.map(m => monthStats(m));
    const sales = db.sales.filter(s => months.includes(s.date.slice(0, 7)));
    const revenue = sum(stats, s => s.revenue);
    const profit = sum(stats, s => s.profit);
    const count = sum(stats, s => s.count);
    const best = stats.reduce((a, b) => (b.revenue > a.revenue ? b : a), stats[0]);

    const rank = {};
    sales.forEach(s => s.items.forEach(i => {
      const r = rank[i.productId] || (rank[i.productId] = { name: i.name, qty: 0, revenue: 0, profit: 0 });
      r.qty += i.qty;
      r.revenue += i.qty * i.price;
      r.profit += i.qty * (i.price - i.cost);
    }));
    const ranking = Object.values(rank).sort((a, b) => b.revenue - a.revenue);
    const rankTotal = sum(ranking, r => r.revenue) || 1;

    const pay = {};
    sales.forEach(s => { pay[s.payment] = (pay[s.payment] || 0) + s.total; });

    el.innerHTML = `
      <div class="toolbar">
        <div class="chips" id="periodChips">
          <button class="chip ${period === 'last12' ? 'active' : ''}" data-p="last12">Últimos 12 meses</button>
          ${years.map(y => `<button class="chip ${period === y ? 'active' : ''}" data-p="${y}">${y}</button>`).join('')}
        </div>
        <div style="flex:1"></div>
        <button class="btn btn-ghost" id="exportCsv"><i class="fa-solid fa-file-csv"></i> Exportar vendas (CSV)</button>
      </div>

      <div class="kpi-grid">
        ${kpi('Faturamento no período', money(revenue), null, 'fa-sack-dollar', 'violet', `${num(count)} vendas`)}
        ${kpi('Lucro no período', money(profit), null, 'fa-coins', 'green', `Margem média ${pctPlain(revenue ? (profit / revenue) * 100 : 0)}`)}
        ${kpi('Ticket médio', money(count ? revenue / count : 0), null, 'fa-receipt', 'blue', `${num(sum(stats, s => s.items))} itens vendidos`)}
        ${kpi('Melhor mês', best && best.revenue ? `${monthName(best.key)}` : '-', null, 'fa-trophy', 'orange', best && best.revenue ? money(best.revenue) : 'Sem vendas')}
      </div>

      <div class="grid-2-1">
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-chart-column"></i> Evolução mensal</h3></div>
          <div class="chart-box"><canvas id="chMonthly"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><h3><i class="fa-solid fa-credit-card"></i> Formas de pagamento</h3></div>
          <div class="chart-box sm" id="payBox"><canvas id="chPay"></canvas></div>
        </div>
      </div>

      <div class="card mb">
        <div class="card-header"><h3><i class="fa-solid fa-code-compare"></i> ${monthName(curKey)} x ${monthName(shiftMonth(curKey, -1))}</h3><span class="pill">Faturamento acumulado dia a dia</span></div>
        <div class="chart-box"><canvas id="chCompare"></canvas></div>
      </div>

      <div class="grid-2">
        <div class="card no-pad">
          <div class="card-header pad"><h3><i class="fa-solid fa-calendar-days"></i> Comparativo mês a mês</h3></div>
          <div class="table-wrap" style="margin-top:16px">
            <table class="table">
              <thead><tr><th>Mês</th><th>Vendas</th><th>Faturamento</th><th>Lucro</th><th>vs mês anterior</th></tr></thead>
              <tbody>${[...stats].reverse().map(s => {
                const prev = monthStats(shiftMonth(s.key, -1));
                const v = variation(s.revenue, prev.revenue);
                const hasCompare = s.revenue || prev.revenue;
                return `<tr>
                  <td><strong>${monthName(s.key).replace(/^./, c => c.toUpperCase())}</strong> <small class="muted">${s.key.slice(0, 4)}</small></td>
                  <td>${num(s.count)}</td>
                  <td><b>${money(s.revenue)}</b></td>
                  <td class="${s.profit >= 0 ? 'text-success' : 'text-danger'}">${money(s.profit)}</td>
                  <td>${hasCompare ? `<span class="trend ${v >= 0 ? 'up' : 'down'}"><i class="fa-solid fa-arrow-${v >= 0 ? 'up' : 'down'}"></i>${pct(v)}</span>` : '<span class="muted">-</span>'}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
          </div>
        </div>

        <div class="card no-pad">
          <div class="card-header pad"><h3><i class="fa-solid fa-ranking-star"></i> Ranking de produtos</h3></div>
          <div class="table-wrap" style="margin-top:16px">
            <table class="table">
              <thead><tr><th>#</th><th>Produto</th><th>Qtd</th><th>Faturamento</th><th>Participação</th></tr></thead>
              <tbody>${ranking.length ? ranking.slice(0, 15).map((r, i) => `<tr>
                <td><span class="rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span></td>
                <td><strong>${esc(r.name)}</strong><br><small class="text-success">Lucro ${money(r.profit)}</small></td>
                <td>${num(r.qty)}</td>
                <td><b>${money(r.revenue)}</b></td>
                <td><div class="share-bar"><div class="bar"><span style="width:${(r.revenue / rankTotal) * 100}%"></span></div><small>${pctPlain((r.revenue / rankTotal) * 100)}</small></div></td>
              </tr>`).join('') : `<tr><td colspan="5">${empty('fa-ranking-star', 'Sem vendas no período', 'O ranking aparecerá quando houver vendas.')}</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>`;

    $('#periodChips').onclick = e => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      state.reportPeriod = b.dataset.p;
      rerender();
    };
    $('#exportCsv').onclick = () => exportCsv(sales);

    makeChart($('#chMonthly'), {
      type: 'bar',
      data: {
        labels: months.map(monthLabel),
        datasets: [
          { label: 'Lucro', type: 'line', data: stats.map(s => r2(s.profit)), borderColor: '#10b981', backgroundColor: '#10b981', tension: .4, borderWidth: 3, pointRadius: 3, order: 0 },
          { label: 'Faturamento', data: stats.map(s => r2(s.revenue)), backgroundColor: barGradient('rgba(99,102,241,.55)', '#8b5cf6'), borderRadius: 8, maxBarThickness: 36, order: 1 }
        ]
      },
      options: baseOptions(true)
    });

    const payEntries = Object.entries(pay).sort((a, b) => b[1] - a[1]);
    if (payEntries.length) doughnut($('#chPay'), payEntries.map(p => p[0]), payEntries.map(p => r2(p[1])), true);
    else $('#payBox').innerHTML = empty('fa-credit-card', 'Sem dados', 'Nenhuma venda no período.');

    const cumulative = (key, limitDay) => {
      const [y, m] = key.split('-').map(Number);
      const arr = Array(new Date(y, m, 0).getDate()).fill(0);
      salesInMonth(key).forEach(s => { arr[Number(s.date.slice(8, 10)) - 1] += s.total; });
      let acc = 0;
      return arr.map((v, i) => (limitDay && i + 1 > limitDay ? null : r2(acc += v)));
    };
    const curData = cumulative(curKey, new Date().getDate());
    const prevData = cumulative(shiftMonth(curKey, -1));
    const days = Math.max(curData.length, prevData.length);
    makeChart($('#chCompare'), {
      type: 'line',
      data: {
        labels: Array.from({ length: days }, (_, i) => `Dia ${i + 1}`),
        datasets: [
          { label: monthName(curKey).replace(/^./, c => c.toUpperCase()), data: curData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.12)', fill: true, tension: .35, borderWidth: 3, pointRadius: 0 },
          { label: monthName(shiftMonth(curKey, -1)).replace(/^./, c => c.toUpperCase()), data: prevData, borderColor: '#94a3b8', borderDash: [6, 6], tension: .35, borderWidth: 2, pointRadius: 0 }
        ]
      },
      options: baseOptions(true)
    });
  }

  function exportCsv(sales) {
    if (!sales.length) return toast('Nenhuma venda no período para exportar.', 'warning');
    // Evita injeção de fórmulas ao abrir no Excel
    const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const n = v => (Number(v) || 0).toFixed(2).replace('.', ',');
    const rows = [['Data', 'Produto', 'Quantidade', 'Preço unitário', 'Custo unitário', 'Total item', 'Pagamento', 'Cliente', 'Desconto da venda', 'Total da venda']];
    [...sales].sort((a, b) => a.date.localeCompare(b.date)).forEach(s => s.items.forEach((i, idx) => {
      rows.push([fmtDate(s.date), i.name, i.qty, n(i.price), n(i.cost), n(i.qty * i.price), s.payment, s.customer, idx === 0 ? n(s.discount) : '', idx === 0 ? n(s.total) : '']);
    }));
    const csv = '\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n');
    download(csv, `vendas-${localISO().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  }

  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ===================== Configurações ===================== */
  function renderConfig(el) {
    const size = new Blob([localStorage.getItem(DB_KEY) || '']).size;
    el.innerHTML = `
      <div class="grid-2">
        <div class="card setting-block">
          <div class="card-header"><h3><i class="fa-solid fa-store"></i> Dados da loja</h3></div>
          <form id="storeForm" class="form-grid">
            <label class="span-2">Nome da loja<input name="storeName" maxlength="40" value="${esc(db.settings.storeName)}"></label>
            <button class="btn btn-primary span-2"><i class="fa-solid fa-check"></i> Salvar</button>
          </form>
        </div>

        <div class="card setting-block">
          <div class="card-header"><h3><i class="fa-solid fa-shield-halved"></i> Backup dos dados</h3></div>
          <p>Seus dados ficam salvos <b>apenas neste navegador</b>. Faça backups com frequência para não perder nada e para levar seus dados para outro computador.</p>
          <div class="setting-actions">
            <button class="btn btn-primary" id="exportBtn"><i class="fa-solid fa-download"></i> Baixar backup</button>
            <label class="btn btn-ghost" style="cursor:pointer"><i class="fa-solid fa-upload"></i> Restaurar backup<input type="file" id="importFile" accept=".json,application/json" hidden></label>
          </div>
          <div class="storage-meter muted" style="font-size:12px">
            ${num(db.products.length)} produtos · ${num(db.sales.length)} vendas · ${num(db.entries.length)} entradas · ${(size / 1024).toFixed(1).replace('.', ',')} KB usados
          </div>
        </div>

        <div class="card setting-block">
          <div class="card-header"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> Dados de demonstração</h3></div>
          <p>Carregue produtos e 6 meses de vendas fictícias para explorar os gráficos, alertas e relatórios.</p>
          <button class="btn btn-ghost" id="demoBtn2"><i class="fa-solid fa-flask"></i> Carregar dados de exemplo</button>
        </div>

        <div class="card setting-block danger-zone">
          <div class="card-header"><h3><i class="fa-solid fa-triangle-exclamation"></i> Zona de perigo</h3></div>
          <p>Apaga todos os produtos, vendas e entradas deste navegador. Essa ação não pode ser desfeita.</p>
          <button class="btn btn-danger" id="clearBtn"><i class="fa-solid fa-trash"></i> Apagar todos os dados</button>
        </div>
      </div>`;

    $('#storeForm').onsubmit = e => {
      e.preventDefault();
      db.settings.storeName = e.target.elements.storeName.value.trim() || 'Controle de Estoque';
      save();
      applyBranding();
      toast('Dados da loja salvos.');
    };

    $('#exportBtn').onclick = () => {
      download(JSON.stringify({ app: 'controle-estoque', version: 1, exportedAt: new Date().toISOString(), data: db }, null, 2), `backup-estoque-${localISO().slice(0, 10)}.json`, 'application/json');
      toast('Backup baixado.');
    };

    $('#importFile').onchange = e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) return toast('Arquivo muito grande.', 'error');
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try { parsed = JSON.parse(reader.result); } catch { return toast('Arquivo de backup inválido.', 'error'); }
        const data = normalizeDB(parsed && parsed.data ? parsed.data : parsed);
        if (!data.products.length && !data.sales.length) return toast('O arquivo não contém dados válidos.', 'error');
        confirmDialog(`Restaurar backup com ${data.products.length} produtos e ${data.sales.length} vendas? Os dados atuais serão substituídos.`, () => {
          db = data;
          save();
          applyBranding();
          toast('Backup restaurado com sucesso!');
          rerender();
        }, { danger: false, yes: 'Restaurar' });
      };
      reader.readAsText(file);
    };

    $('#demoBtn2').onclick = askLoadDemo;

    $('#clearBtn').onclick = () => confirmDialog('Tem certeza? Todos os dados serão apagados permanentemente.', () => {
      db = { ...emptyDB(), settings: db.settings };
      state.cart = [];
      save();
      toast('Todos os dados foram apagados.', 'info');
      rerender();
    }, { yes: 'Apagar tudo' });
  }

  /* ===================== Dados de demonstração ===================== */
  function askLoadDemo() {
    const go = () => { loadDemo(); toast('Dados de exemplo carregados. Explore à vontade!', 'info'); location.hash = '#dashboard'; rerender(); };
    if (db.products.length || db.sales.length) confirmDialog('Isso vai substituir seus dados atuais pelos dados de exemplo. Continuar?', go, { yes: 'Carregar exemplo' });
    else go();
  }

  function loadDemo() {
    // nome, categoria, descrição, custo, venda, estoque final, emergência, ideal, peso de venda, parado
    const P = [
      ['Fone de Ouvido Bluetooth', 'Eletrônicos', 'Fone sem fio com estojo carregador', 45, 89.9, 8, 10, 30, 9],
      ['Carregador USB-C 20W', 'Eletrônicos', 'Carregamento rápido', 22, 49.9, 35, 12, 40, 10],
      ['Capinha de Celular', 'Acessórios', 'Silicone, modelos variados', 6.5, 24.9, 3, 15, 50, 14],
      ['Película de Vidro 3D', 'Acessórios', 'Proteção total da tela', 3, 14.9, 62, 20, 80, 16],
      ['Cabo Lightning 1m', 'Eletrônicos', 'Compatível com iPhone', 9, 29.9, 18, 10, 30, 8],
      ['Caixa de Som Portátil', 'Eletrônicos', 'Resistente à água, 10W', 70, 149.9, 5, 4, 12, 3],
      ['Smartwatch Fit', 'Eletrônicos', 'Monitor cardíaco e notificações', 95, 199.9, 0, 3, 10, 2.5],
      ['Power Bank 10.000mAh', 'Eletrônicos', 'Bateria portátil com 2 saídas', 48, 99.9, 14, 6, 20, 4],
      ['Suporte Veicular', 'Acessórios', 'Fixação magnética', 12, 34.9, 22, 8, 25, 4],
      ['Mouse sem Fio', 'Informática', 'Silencioso, 1600 DPI', 25, 59.9, 11, 8, 20, 4],
      ['Teclado Bluetooth', 'Informática', 'Compacto, multi-dispositivo', 60, 129.9, 9, 4, 10, 1.5, true]
    ];
    const created = localISO(new Date(Date.now() - 200 * 864e5));
    const products = P.map(([name, category, description, cost, price, qty, min, ideal, w, stale]) => ({ id: uid(), name, category, description, cost, price, qty, min, ideal, createdAt: created, w, stale: !!stale }));
    const sales = [];
    const entries = [];
    const now = new Date();
    const payW = [['Pix', 45], ['Cartão de crédito', 25], ['Cartão de débito', 15], ['Dinheiro', 15]];
    const weighted = (arr, wFn) => { const t = sum(arr, wFn); let r = Math.random() * t; return arr.find(x => (r -= wFn(x)) <= 0) || arr[0]; };

    for (let i = 180; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const growth = 1 + (180 - i) / 130;
      const wd = day.getDay();
      const factor = wd === 6 ? 1.6 : wd === 5 ? 1.3 : wd === 0 ? 0.5 : 1;
      const n = Math.round(Math.random() * 2.4 * growth * factor);
      for (let k = 0; k < n; k++) {
        const hour = 9 + Math.floor(Math.random() * 10);
        if (i === 0 && hour >= now.getHours()) continue;
        const d = new Date(day);
        d.setHours(hour, Math.floor(Math.random() * 60));
        const pool = products.filter(p => !(p.stale && i < 40));
        const items = [];
        const itemsN = 1 + (Math.random() < .3 ? 1 : 0) + (Math.random() < .1 ? 1 : 0);
        for (let j = 0; j < itemsN; j++) {
          const p = weighted(pool, x => x.w);
          if (items.some(x => x.productId === p.id)) continue;
          items.push({ productId: p.id, name: p.name, qty: 1 + (Math.random() < .2 ? 1 : 0), price: p.price, cost: p.cost });
        }
        const subtotal = r2(sum(items, x => x.qty * x.price));
        const discount = Math.random() < .08 ? r2(subtotal * .05) : 0;
        sales.push({
          id: uid(), date: localISO(d), items, subtotal, discount,
          total: r2(subtotal - discount),
          profit: r2(sum(items, x => x.qty * (x.price - x.cost)) - discount),
          payment: weighted(payW, x => x[1])[0], customer: ''
        });
      }
    }

    products.forEach(p => {
      for (let i = 180; i > 0; i -= 30) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 10, 0);
        entries.push({ id: uid(), productId: p.id, name: p.name, qty: Math.max(Math.round(p.ideal * .8), 1), cost: p.cost, date: localISO(d), note: 'Fornecedor Central' });
      }
      delete p.w;
      delete p.stale;
    });

    db = { products, entries, sales, settings: db.settings };
    state.cart = [];
    save();
  }

  /* ===================== Alertas (sino + menu) ===================== */
  function updateAlerts() {
    const alerts = alertProducts();
    const n = alerts.length ? String(alerts.length) : '';
    $('#navAlertBadge').textContent = n;
    $('#bellBadge').textContent = n;
    $('#bellMenu').innerHTML = `
      <div class="dropdown-head"><span>Alertas de estoque</span>${alerts.length ? `<span class="badge badge-danger">${alerts.length}</span>` : ''}</div>
      ${alerts.length ? `<div class="list">${alerts.slice(0, 8).map(p => `
        <a href="#reposicao" class="list-item">
          ${avatar(p.name, true)}
          <div class="grow"><strong>${esc(p.name)}</strong><small>${p.qty <= 0 ? 'Esgotado' : `Restam ${num(p.qty)} un.`} · comprar ~${num(suggestedQty(p))} un. (${money(suggestedQty(p) * p.cost)})</small></div>
        </a>`).join('')}</div>
        <a href="#reposicao" class="btn btn-primary btn-block btn-sm" style="margin-top:8px">Abrir lista de compras</a>`
        : empty('fa-circle-check', 'Tudo em dia', 'Nenhum produto no estoque de emergência.', '', 'success')}`;
  }

  /* ===================== Navegação ===================== */
  const PAGES = {
    dashboard: { title: 'Dashboard', sub: 'Visão geral do seu negócio', render: renderDashboard },
    produtos: { title: 'Produtos', sub: 'Cadastre e acompanhe seu estoque', render: renderProducts },
    entradas: { title: 'Entradas', sub: 'Registre as mercadorias que chegaram na loja', render: renderEntries },
    vendas: { title: 'Vendas', sub: 'Lance suas vendas e o estoque é atualizado automaticamente', render: renderSales },
    reposicao: { title: 'Reposição', sub: 'O que comprar e quanto você vai pagar', render: renderRestock },
    relatorios: { title: 'Relatórios', sub: 'Indicadores e comparativos do seu desempenho', render: renderReports },
    config: { title: 'Configurações', sub: 'Loja, backup e dados', render: renderConfig }
  };

  let currentPage = '';

  function navigate(keepScroll = false) {
    const page = PAGES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
    const changed = page !== currentPage;
    currentPage = page;
    destroyCharts();
    $$('.page').forEach(s => { s.classList.toggle('active', s.id === 'page-' + page); if (s.id !== 'page-' + page) s.innerHTML = ''; });
    $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    $('#pageTitle').textContent = PAGES[page].title;
    $('#pageSubtitle').textContent = PAGES[page].sub;
    document.title = `${PAGES[page].title} · ${db.settings.storeName}`;
    PAGES[page].render($('#page-' + page));
    document.documentElement.classList.remove('sidebar-open');
    $('#bellMenu').classList.remove('open');
    if (changed && !keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  const rerender = () => navigate(true);

  function applyBranding() {
    $('#brandName').textContent = db.settings.storeName;
    document.title = `${PAGES[currentPage]?.title || 'Dashboard'} · ${db.settings.storeName}`;
  }

  /* ===================== Eventos globais ===================== */
  function setThemeIcon() {
    $('#themeToggle').innerHTML = `<i class="fa-solid fa-${document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'}"></i>`;
  }

  function init() {
    if (window.Chart) {
      Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
      Chart.defaults.font.size = 12;
    }

    const name = String(user.name || 'Visitante');
    $('#userName').textContent = name;
    $('#userEmail').textContent = user.email;
    $('#userAvatar').textContent = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    if (/^https:\/\//.test(user.photo || '')) {
      const img = Object.assign(document.createElement('img'), { src: user.photo, alt: '', referrerPolicy: 'no-referrer' });
      img.onload = () => { $('#userAvatar').textContent = ''; $('#userAvatar').appendChild(img); };
    }
    applyBranding();
    setThemeIcon();

    $('#menuToggle').onclick = () => {
      const root = document.documentElement;
      if (window.innerWidth <= 960) root.classList.toggle('sidebar-open');
      else {
        root.classList.toggle('sidebar-collapsed');
        localStorage.setItem('ce_sidebar', root.classList.contains('sidebar-collapsed') ? 'collapsed' : '');
        setTimeout(() => charts.forEach(c => c.resize()), 320);
      }
    };
    $('#sidebarBackdrop').onclick = () => document.documentElement.classList.remove('sidebar-open');

    $('#themeToggle').onclick = () => {
      const root = document.documentElement;
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('ce_theme', root.dataset.theme);
      setThemeIcon();
      rerender();
    };

    $('#bellBtn').onclick = e => { e.stopPropagation(); $('#bellMenu').classList.toggle('open'); };
    document.addEventListener('click', e => { if (!e.target.closest('.dropdown')) $('#bellMenu').classList.remove('open'); });

    $('#logoutBtn').onclick = () => confirmDialog('Deseja sair da sua conta? Seus dados continuam salvos neste navegador.', () => {
      Promise.resolve(window.ceSignOut && window.ceSignOut()).catch(() => {}).finally(() => {
        localStorage.removeItem('ce_user');
        location.replace('index.html');
      });
    }, { danger: false, yes: 'Sair' });

    $('#modal').addEventListener('click', e => {
      if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('#bellMenu').classList.remove('open'); } });

    // Mantém abas abertas em sincronia
    window.addEventListener('storage', e => {
      if (e.key === DB_KEY) { db = loadDB(); updateAlerts(); rerender(); }
    });

    window.addEventListener('hashchange', () => navigate());

    updateAlerts();
    navigate();

    const alerts = alertProducts();
    if (alerts.length) {
      setTimeout(() => toast(`Atenção: ${alerts.length} produto(s) no estoque de emergência. Confira a aba Reposição.`, 'warning', 6000), 700);
    }
  }

  init();
})();

(() => {
  'use strict';

  const inApp = !!document.getElementById('sidebar');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const PAGE_NAMES = { dashboard: 'Dashboard', produtos: 'Produtos', entradas: 'Entradas', vendas: 'Vendas', reposicao: 'Reposição', relatorios: 'Relatórios', config: 'Configurações' };

  /* ===================== Passo a passo ===================== */
  const TOUR = [
    { page: 'dashboard', title: 'Bem-vindo ao Dashboard', text: 'Aqui você vê a visão geral do negócio: faturamento e lucro do mês, comparação com o mês anterior, produtos em alerta e gráficos. É a primeira tela depois do login.' },
    { page: 'config', title: 'Configure sua loja', text: 'Em <b>Configurações</b>, coloque o nome da sua loja. Se quiser só testar, clique em <b>Carregar dados de exemplo</b>: o sistema cria produtos e 6 meses de vendas fictícias para você explorar tudo.' },
    { page: 'produtos', title: 'Cadastre seus produtos', text: 'Clique em <b>Novo produto</b> e preencha: nome, categoria, quantidade que entrou, <b>valor pago</b>, <b>preço de venda</b> e o <b>número de emergência</b> (quando o estoque chegar nele, você é alertado). O <b>estoque ideal</b> é opcional e ajuda a calcular quanto comprar.' },
    { page: 'entradas', title: 'Registre o que chega na loja', text: 'Quando chegar mercadoria, vá em <b>Entradas</b>, escolha o produto, informe a quantidade e o valor pago por unidade. O estoque aumenta automaticamente e o histórico de compras fica salvo.' },
    { page: 'vendas', title: 'Lance suas vendas', text: 'Em <b>Vendas</b>, escolha o produto, a quantidade e clique em <b>Adicionar ao carrinho</b>. Depois escolha a forma de pagamento, desconto (se houver) e clique em <b>Finalizar venda</b>. O estoque baixa sozinho.' },
    { page: 'reposicao', title: 'Saiba o que comprar', text: 'A aba <b>Reposição</b> lista os produtos que chegaram no número de emergência, sugere a quantidade e mostra <b>quanto você vai pagar</b> com base no valor que pagou antes. Dá para copiar, mandar pelo WhatsApp, imprimir e marcar como <b>Comprei</b>.' },
    { page: 'relatorios', title: 'Acompanhe os resultados', text: 'Em <b>Relatórios</b> você compara mês a mês: faturamento, lucro, ticket médio, melhor mês, produtos mais vendidos e formas de pagamento. Também dá para exportar as vendas em CSV (abre no Excel).' },
    { page: 'config', title: 'Faça backup', text: 'Seus dados ficam salvos <b>só neste navegador</b>. Em <b>Configurações → Baixar backup</b> você guarda um arquivo com tudo e pode restaurar em outro computador. Pronto, agora é com você!' }
  ];

  /* ===================== Base de conhecimento ===================== */
  const go = page => (inApp ? `<button class="cb-action" data-go="${page}"><i class="fa-solid fa-arrow-right"></i> Abrir ${PAGE_NAMES[page]}</button>` : '');

  const INTENTS = [
    { k: ['oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'e ai', 'hey'], a: () => 'Olá! Tudo ótimo por aqui. 😊 Posso tirar dúvidas sobre qualquer parte do sistema ou te mostrar um <b>passo a passo</b> de como usar. O que você precisa?', chips: ['Passo a passo', 'Como cadastrar produto?', 'Como lançar venda?'] },
    { k: ['obrigad', 'valeu', 'agradec', 'show', 'perfeito', 'otimo'], a: () => 'Por nada! Se surgir outra dúvida é só chamar. 🙌' },
    { k: ['quem e voce', 'voce e', 'robo', 'bot', 'assistente', 'o que voce faz', 'ajuda'], a: () => 'Sou o assistente do Controle de Estoque. Respondo dúvidas sobre produtos, entradas, vendas, reposição, relatórios, backup e muito mais — e posso te guiar com um passo a passo.', chips: ['Passo a passo', 'Onde ficam meus dados?'] },
    { k: ['passo a passo', 'tutorial', 'como usar', 'como funciona', 'comecar', 'primeiros passos', 'guia', 'ensina', 'me ensine', 'nao sei usar'], tour: true, w: 0.6 },

    { k: ['cadastr', 'produto', 'novo produto', 'adicionar produto', 'incluir produto', 'criar produto', 'colocar produto'], a: () => `Para cadastrar um produto:<ol><li>Abra <b>Produtos</b> e clique em <b>Novo produto</b>.</li><li>Preencha nome, categoria (opcional) e a quantidade que entrou.</li><li>Informe o <b>valor pago</b> (unitário) e o <b>preço de venda</b>.</li><li>Defina o <b>número de emergência</b> e, se quiser, o <b>estoque ideal</b>.</li><li>Clique em <b>Cadastrar produto</b>.</li></ol>A quantidade inicial já entra no histórico de entradas. ${go('produtos')}`, chips: ['O que é número de emergência?', 'Estoque ideal'] },
    { k: ['editar produto', 'alterar produto', 'mudar preco', 'alterar preco', 'editar', 'corrigir produto'], a: () => `Em <b>Produtos</b>, clique no ícone de lápis <i class="fa-solid fa-pen"></i> na linha do produto, altere o que precisar e clique em <b>Salvar alterações</b>. ${go('produtos')}` },
    { k: ['excluir produto', 'apagar produto', 'remover produto', 'deletar produto'], a: () => `Em <b>Produtos</b>, clique na lixeira <i class="fa-solid fa-trash"></i> do produto e confirme. O histórico de vendas e entradas desse produto é mantido nos relatórios. ${go('produtos')}` },
    { k: ['buscar produto', 'procurar', 'pesquisar', 'filtro', 'filtrar', 'em alerta'], a: () => `Na tela de <b>Produtos</b> use a barra de busca (nome, categoria ou descrição) e os filtros <b>Todos</b>, <b>Em alerta</b> e <b>Em dia</b>. ${go('produtos')}` },
    { k: ['emergencia', 'estoque minimo', 'minimo', 'alerta', 'aviso', 'avisar', 'limite', 'sino', 'notifica'], a: () => `O <b>número de emergência</b> é o limite mínimo de cada produto. Quando o estoque chega nele (ou abaixo), o sistema:<ul><li>mostra um alerta no sino <i class="fa-solid fa-bell"></i> e no menu Reposição;</li><li>avisa assim que uma venda faz o produto bater o limite;</li><li>coloca o produto na lista de compras com a quantidade e o valor a pagar.</li></ul>${go('reposicao')}`, chips: ['Estoque ideal', 'Lista de compras'] },
    { k: ['estoque ideal', 'ideal', 'quanto comprar', 'sugestao', 'sugerid'], a: () => 'O <b>estoque ideal</b> é a quantidade que você gostaria de ter. Na reposição, o sistema sugere comprar <b>ideal − estoque atual</b>. Se você não preencher, ele usa o dobro do número de emergência. Você sempre pode editar a quantidade antes de registrar.' },
    { k: ['margem', 'lucro por unidade', 'como calcula', 'calculo', 'investimento'], a: () => 'Os cálculos são automáticos:<ul><li><b>Lucro por unidade</b> = preço de venda − valor pago</li><li><b>Margem</b> = lucro ÷ preço de venda</li><li><b>Valor em estoque</b> = quantidade × valor pago</li><li><b>Lucro da venda</b> = soma dos lucros dos itens − desconto</li></ul>A margem fica verde (≥ 30%), amarela (≥ 10%) ou vermelha.' },

    { k: ['entrada', 'chegou', 'recebi', 'mercadoria', 'fornecedor', 'abastecer', 'repor estoque', 'adicionar estoque', 'aumentar estoque'], a: () => `Para registrar mercadoria que chegou:<ol><li>Abra <b>Entradas</b>.</li><li>Escolha o produto, a quantidade e o valor pago por unidade.</li><li>Opcional: data e fornecedor/observação.</li><li>Clique em <b>Registrar entrada</b>.</li></ol>O estoque aumenta na hora. Dica: em Produtos, o botão <i class="fa-solid fa-plus"></i> já abre a entrada do produto. ${go('entradas')}` },
    { k: ['excluir entrada', 'apagar entrada', 'entrada errada'], a: () => 'No histórico de <b>Entradas</b>, clique na lixeira da linha. O estoque é ajustado automaticamente. Se parte dessas unidades já foi vendida, a exclusão é bloqueada para o estoque não ficar negativo.' },

    { k: ['venda', 'vender', 'vendi', 'carrinho', 'lancar', 'registrar venda', 'nova venda'], a: () => `Para lançar uma venda:<ol><li>Abra <b>Vendas</b> (ou o botão <b>Nova venda</b> no topo).</li><li>Escolha o produto, a quantidade e clique em <b>Adicionar ao carrinho</b>. Repita para outros itens.</li><li>Escolha a forma de pagamento, desconto e cliente (opcionais).</li><li>Clique em <b>Finalizar venda</b>.</li></ol>O estoque baixa automaticamente e o sistema não deixa vender mais do que você tem. ${go('vendas')}`, chips: ['Cancelar uma venda', 'Formas de pagamento'] },
    { k: ['cancelar venda', 'excluir venda', 'apagar venda', 'estornar', 'devolucao', 'venda errada'], a: () => `No <b>Histórico de vendas</b>, clique na lixeira da venda e confirme. Os produtos <b>voltam para o estoque</b> automaticamente. O ícone de olho <i class="fa-solid fa-eye"></i> mostra os detalhes. ${go('vendas')}` },
    { k: ['desconto', 'pagamento', 'pix', 'cartao', 'dinheiro', 'credito', 'debito'], a: () => 'Na venda você escolhe entre <b>Pix, Dinheiro, Cartão de crédito, Cartão de débito ou Outro</b> e pode dar desconto em reais. O desconto é descontado do total e do lucro. Nos Relatórios há um gráfico com as formas de pagamento.' },

    { k: ['reposicao', 'repor', 'lista de compra', 'comprar', 'whatsapp', 'imprimir', 'comprei', 'quanto vou pagar'], a: () => `A aba <b>Reposição</b> mostra:<ul><li>os produtos no estoque de emergência;</li><li>a quantidade sugerida e o <b>valor total a pagar</b> (com base no valor que você pagou);</li><li>previsão de quantos dias o estoque dura;</li><li>"Fique de olho": produtos quase no limite.</li></ul>Você pode editar quantidades/valores, <b>Copiar</b>, enviar pelo <b>WhatsApp</b>, <b>Imprimir</b> e clicar em <b>Comprei</b> para dar entrada no estoque. ${go('reposicao')}` },
    { k: ['dura', 'previsao', 'acabar', 'quantos dias'], a: () => 'A previsão de duração usa a média de vendas dos <b>últimos 30 dias</b> de cada produto: estoque atual ÷ vendas por dia. Se não houve vendas recentes, aparece "Sem vendas recentes".' },

    { k: ['relatorio', 'grafico', 'comparativo', 'comparar', 'faturamento', 'ticket', 'melhor mes', 'mais vendido', 'indicador', 'desempenho'], a: () => `Em <b>Relatórios</b> você encontra faturamento, lucro, ticket médio, melhor mês, evolução mensal, comparação do mês atual com o anterior dia a dia, tabela mês a mês, ranking de produtos e formas de pagamento. Filtre por <b>últimos 12 meses</b> ou por ano. ${go('relatorios')}`, chips: ['Exportar para Excel'] },
    { k: ['csv', 'excel', 'planilha', 'exportar venda'], a: () => `Em <b>Relatórios</b>, clique em <b>Exportar vendas (CSV)</b>. O arquivo abre no Excel ou Google Planilhas. ${go('relatorios')}` },
    { k: ['dashboard', 'painel', 'inicio', 'visao geral', 'tela inicial'], a: () => `O <b>Dashboard</b> é o resumo do negócio: faturamento e lucro do mês com a variação em relação ao mês anterior, valor em estoque, alertas, gráficos e dicas automáticas. ${go('dashboard')}` },

    { k: ['banco de dados', 'onde ficam', 'onde fica', 'salvo', 'salva', 'armazen', 'seguro', 'seguranca', 'privacidade', 'meus dados', 'nuvem', 'internet'], a: () => 'Seus dados ficam salvos <b>apenas no seu navegador</b>, sem banco de dados externo. Isso deixa tudo rápido e privado, mas significa que, se você limpar os dados do navegador ou trocar de computador, precisará de um <b>backup</b>.', chips: ['Como fazer backup?'] },
    { k: ['backup', 'restaurar', 'outro computador', 'outro navegador', 'importar', 'perder dados', 'transferir'], a: () => `Em <b>Configurações</b>:<ul><li><b>Baixar backup</b> salva um arquivo .json com todos os dados.</li><li><b>Restaurar backup</b> carrega esse arquivo (em qualquer computador) e substitui os dados atuais.</li></ul>Recomendo fazer backup com frequência. ${go('config')}` },
    { k: ['exemplo', 'demonstracao', 'demo', 'teste', 'testar', '6 meses', 'seis meses', 'ficticio'], a: () => `Em <b>Configurações → Carregar dados de exemplo</b>, o sistema cria produtos e <b>6 meses de vendas fictícias</b> para você testar gráficos, alertas e relatórios. Atenção: isso substitui os dados atuais (faça backup antes, se tiver dados reais). ${go('config')}` },
    { k: ['apagar tudo', 'zerar', 'limpar dados', 'resetar', 'comecar do zero', 'apagar dados'], a: () => `Em <b>Configurações → Zona de perigo</b>, clique em <b>Apagar todos os dados</b>. Isso remove produtos, vendas e entradas deste navegador e <b>não pode ser desfeito</b>. Faça um backup antes. ${go('config')}` },
    { k: ['nome da loja', 'mudar nome', 'renomear', 'nome do sistema'], a: () => `Em <b>Configurações → Dados da loja</b>, digite o nome e clique em <b>Salvar</b>. Ele aparece no menu lateral e na lista de compras. ${go('config')}` },
    { k: ['tema', 'escuro', 'claro', 'dark', 'modo noturno'], a: () => 'Clique no ícone de lua <i class="fa-solid fa-moon"></i> / sol <i class="fa-solid fa-sun"></i> no topo da tela para alternar entre tema claro e escuro. A escolha fica salva.' },
    { k: ['menu', 'lateral', 'recolher', 'esconder menu', 'celular', 'mobile'], a: () => 'O botão <i class="fa-solid fa-bars"></i> no topo recolhe ou expande o menu lateral. No celular, ele abre o menu por cima da tela. O sistema é totalmente responsivo.' },
    { k: ['login', 'entrar', 'senha', 'google', 'conta', 'cadastro de conta', 'criar conta', 'sair', 'logout', 'deslogar'], a: () => 'Você pode entrar com <b>Google</b> ou com e-mail e senha (e criar uma conta na tela de login). Para sair, use o botão <i class="fa-solid fa-right-from-bracket"></i> no rodapé do menu lateral — seus dados continuam salvos no navegador. Cada conta tem seus próprios dados.' },
    { k: ['resumo', 'situacao', 'como esta', 'como estou', 'meu estoque', 'quantos produtos', 'status'], summary: true }
  ];

  // Cada palavra da chave precisa iniciar alguma palavra do texto (palavras curtas exigem igualdade).
  function match(text) {
    const tokens = norm(text).split(' ');
    const has = w => tokens.some(tok => (w.length <= 3 ? tok === w : tok.startsWith(w)));
    let best = null, bestScore = 0;
    INTENTS.forEach(intent => {
      const score = intent.k.reduce((s, k) => (k.split(' ').every(has) ? s + k.length : s), 0) * (intent.w || 1);
      if (score > bestScore) { best = intent; bestScore = score; }
    });
    return best;
  }

  function summary() {
    if (!inApp) return 'Entre na sua conta para eu mostrar um resumo do seu estoque. 😉';
    let data;
    try {
      const u = JSON.parse(localStorage.getItem('ce_user'));
      data = JSON.parse(localStorage.getItem('ce_data_' + String(u.email).toLowerCase()));
    } catch { /* sem dados */ }
    const products = Array.isArray(data?.products) ? data.products : [];
    const sales = Array.isArray(data?.sales) ? data.sales : [];
    if (!products.length) return `Você ainda não cadastrou produtos. Comece por <b>Produtos → Novo produto</b> ou carregue os dados de exemplo. ${go('produtos')}`;
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const month = sales.filter(s => String(s.date).startsWith(key));
    const alerts = products.filter(p => p.qty <= p.min);
    const stockValue = products.reduce((a, p) => a + p.qty * p.cost, 0);
    const restock = alerts.reduce((a, p) => a + Math.max((p.ideal > p.min ? p.ideal : Math.max(p.min * 2, p.min + 1)) - p.qty, 1) * p.cost, 0);
    return `Resumo agora:<ul>
      <li><b>${products.length}</b> produto(s), valor em estoque de <b>${money(stockValue)}</b></li>
      <li><b>${month.length}</b> venda(s) este mês, faturamento de <b>${money(month.reduce((a, s) => a + (Number(s.total) || 0), 0))}</b> e lucro de <b>${money(month.reduce((a, s) => a + (Number(s.profit) || 0), 0))}</b></li>
      <li>${alerts.length ? `<b>${alerts.length}</b> produto(s) no estoque de emergência — reposição sugerida de <b>${money(restock)}</b>` : 'Nenhum produto no estoque de emergência ✅'}</li>
    </ul>${alerts.length ? go('reposicao') : go('dashboard')}`;
  }

  /* ===================== Interface ===================== */
  const root = document.createElement('div');
  root.className = 'cb';
  root.innerHTML = `
    <button class="cb-launcher" id="cbLauncher" aria-label="Abrir assistente" title="Dúvidas? Fale com o assistente">
      <i class="fa-solid fa-comment-dots"></i><i class="fa-solid fa-xmark"></i>
      <span class="cb-ping" id="cbPing"></span>
    </button>
    <section class="cb-panel" id="cbPanel" role="dialog" aria-label="Assistente virtual" aria-hidden="true">
      <header class="cb-head">
        <div class="cb-bot"><i class="fa-solid fa-robot"></i></div>
        <div class="grow"><strong>Assistente</strong><small><span class="cb-online"></span> Online · tira suas dúvidas</small></div>
        <button class="cb-icon" id="cbRestart" title="Recomeçar conversa"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="cb-icon" id="cbClose" title="Fechar"><i class="fa-solid fa-chevron-down"></i></button>
      </header>
      <div class="cb-body" id="cbBody" aria-live="polite"></div>
      <div class="cb-chips" id="cbChips"></div>
      <form class="cb-input" id="cbForm" autocomplete="off">
        <input id="cbText" maxlength="300" placeholder="Digite sua dúvida...">
        <button class="cb-send" title="Enviar"><i class="fa-solid fa-paper-plane"></i></button>
      </form>
    </section>`;
  document.body.appendChild(root);

  const $ = s => root.querySelector(s);
  const body = $('#cbBody');
  const chipsEl = $('#cbChips');
  const DEFAULT_CHIPS = ['Passo a passo', 'Como cadastrar produto?', 'Como lançar venda?', 'Número de emergência', 'Lista de compras', 'Backup'];
  let tourStep = -1;
  let started = false;

  const scroll = () => { body.scrollTop = body.scrollHeight; };

  function addMsg(html, who = 'bot') {
    const el = document.createElement('div');
    el.className = `cb-msg cb-from-${who}`;
    if (who === 'user') el.textContent = html; else el.innerHTML = html;
    body.appendChild(el);
    scroll();
    return el;
  }

  function setChips(list) {
    chipsEl.innerHTML = (list || DEFAULT_CHIPS).map(c => `<button type="button" class="cb-chip">${esc(c)}</button>`).join('');
  }

  function botSay(html, chips) {
    const typing = addMsg('<span class="cb-typing"><i></i><i></i><i></i></span>');
    chipsEl.innerHTML = '';
    setTimeout(() => {
      typing.innerHTML = html;
      setChips(chips);
      scroll();
    }, 450 + Math.min(html.length, 600) / 2);
  }

  function highlightNav(page) {
    if (!inApp) return;
    document.querySelectorAll('.nav a.cb-highlight').forEach(a => a.classList.remove('cb-highlight'));
    const a = document.querySelector(`.nav a[data-page="${page}"]`);
    if (a) { a.classList.add('cb-highlight'); setTimeout(() => a.classList.remove('cb-highlight'), 4000); }
  }

  function showTourStep(i) {
    tourStep = i;
    const s = TOUR[i];
    if (inApp) { location.hash = '#' + s.page; highlightNav(s.page); }
    const nav = `<div class="cb-tour-nav">
      ${i > 0 ? '<button class="cb-action ghost" data-tour="prev"><i class="fa-solid fa-arrow-left"></i> Voltar</button>' : ''}
      ${i < TOUR.length - 1 ? '<button class="cb-action" data-tour="next">Próximo <i class="fa-solid fa-arrow-right"></i></button>' : '<button class="cb-action" data-tour="end"><i class="fa-solid fa-check"></i> Concluir</button>'}
    </div>`;
    botSay(`<div class="cb-step"><span>Passo ${i + 1} de ${TOUR.length}</span><div class="cb-progress"><i style="width:${((i + 1) / TOUR.length) * 100}%"></i></div></div>
      <b>${s.title}</b><br>${s.text}${inApp ? '' : `<br><small class="cb-muted">Essa tela fica no menu <b>${PAGE_NAMES[s.page]}</b> depois que você entrar.</small>`}${nav}`, ['Sair do passo a passo']);
  }

  function startTour() {
    showTourStep(0);
  }

  function answer(text) {
    const t = norm(text);
    if (tourStep >= 0 && /^(proximo|continuar|seguinte|sim|ok)$/.test(t)) return showTourStep(Math.min(tourStep + 1, TOUR.length - 1));
    if (/sair do passo a passo|parar|cancelar tour/.test(t)) { tourStep = -1; return botSay('Tudo bem, saí do passo a passo. Pode perguntar o que quiser!'); }
    const intent = match(text);
    if (!intent) {
      return botSay('Hmm, não entendi muito bem. 🤔 Tente com outras palavras ou escolha um dos assuntos abaixo. Também posso te mostrar o <b>passo a passo</b> completo.', ['Passo a passo', 'Produtos', 'Vendas', 'Reposição', 'Relatórios', 'Backup']);
    }
    if (intent.tour) return startTour();
    tourStep = -1;
    botSay(intent.summary ? summary() : intent.a(), intent.chips);
  }

  function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    addMsg(text, 'user');
    answer(text);
  }

  function welcome() {
    started = true;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    botSay(`${greet}! 👋 Sou o assistente do <b>Controle de Estoque</b>.<br>Posso responder qualquer dúvida sobre o sistema ou te mostrar um <b>passo a passo</b> de como usar.`,
      ['Passo a passo', ...(inApp ? ['Resumo do meu estoque'] : ['Onde ficam meus dados?']), 'Como cadastrar produto?', 'Como lançar venda?', 'Número de emergência']);
  }

  function open(on) {
    root.classList.toggle('open', on);
    $('#cbPanel').setAttribute('aria-hidden', String(!on));
    if (on) {
      $('#cbPing').hidden = true;
      localStorage.setItem('ce_chat_seen', '1');
      if (!started) welcome();
      setTimeout(() => $('#cbText').focus(), 200);
    }
  }

  if (localStorage.getItem('ce_chat_seen')) $('#cbPing').hidden = true;

  $('#cbLauncher').onclick = () => open(!root.classList.contains('open'));
  $('#cbClose').onclick = () => open(false);
  $('#cbRestart').onclick = () => { body.innerHTML = ''; tourStep = -1; welcome(); };
  $('#cbForm').onsubmit = e => { e.preventDefault(); const i = $('#cbText'); send(i.value); i.value = ''; };
  chipsEl.onclick = e => { const c = e.target.closest('.cb-chip'); if (c) send(c.textContent); };
  chipsEl.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { chipsEl.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });

  body.onclick = e => {
    const g = e.target.closest('[data-go]');
    const t = e.target.closest('[data-tour]');
    if (g) {
      location.hash = '#' + g.dataset.go;
      highlightNav(g.dataset.go);
      if (window.innerWidth <= 640) open(false);
    } else if (t) {
      t.closest('.cb-tour-nav').remove();
      if (t.dataset.tour === 'next') showTourStep(tourStep + 1);
      else if (t.dataset.tour === 'prev') showTourStep(tourStep - 1);
      else { tourStep = -1; botSay('🎉 Pronto! Agora você já sabe usar tudo. Se tiver qualquer dúvida, é só perguntar aqui.'); }
    }
  };

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('open')) open(false); });
})();

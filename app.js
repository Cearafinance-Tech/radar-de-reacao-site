// Radar de Reação · site estático. Lê só dados.json (números agregados, sem textos nem autores).

const estado = { dados: null, evento: null, publico: 'publico', graficos: {} };

// Datas que ajudam a ler o gráfico de preços (domingos de eleição em 2026).
const MARCOS = [
  { data: '2026-10-04', texto: '1º turno' },
  { data: '2026-10-25', texto: '2º turno' },
];

const NOMES = {
  publico: { titulo: 'Público online', fonte: 'comentários no YouTube', unidade: 'comentários', artigo: 'os' },
  mercado: { titulo: 'Mercado', fonte: 'notícias de economia', unidade: 'notícias', artigo: 'as' },
};

// Aberto direto do computador (file://) para testar: usa os dados já publicados.
const URL_DADOS = location.protocol === 'file:'
  ? 'https://devdavicod.github.io/radar-de-reacao-site/dados.json'
  : 'dados.json';

// Modo incorporado: dentro de um iframe (site da Ceará Finance) ou com ?incorporado=1 no endereço.
const INCORPORADO = new URLSearchParams(location.search).has('incorporado') || window.self !== window.top;
if (INCORPORADO) document.documentElement.classList.add('incorporado');

// Avisa a página da liga a altura do Radar, para o iframe crescer sem barra de rolagem.
function avisarAltura() {
  if (window.self === window.top) return;
  window.parent.postMessage({ tipo: 'radar-altura', altura: document.documentElement.scrollHeight }, '*');
}
if (INCORPORADO && 'ResizeObserver' in window) {
  new ResizeObserver(avisarAltura).observe(document.documentElement);
}

const cor = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();

function comAlfa(hex, alfa) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

function dataBR(iso, comAno = true) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

function num(v, casas = 1) {
  if (v === null || v === undefined) return '—';
  return v.toFixed(casas).replace('.', ',');
}

function sinal(v, casas = 1) {
  if (v === null || v === undefined) return '—';
  const t = num(v, casas);
  return v > 0 ? `+${t}` : t.replace('-', '−');
}

const inteiro = (v) => Math.round(v).toLocaleString('pt-BR');

function el(tag, texto, classe) {
  const e = document.createElement(tag);
  if (texto !== undefined) e.textContent = texto;
  if (classe) e.className = classe;
  return e;
}

const resultado = (semana, publico) => semana[publico] || { n: 0 };
const semAmostra = (r) => !r.n || r.amostra_baixa;

// Resumo do período todo. O Painel já manda pronto ("total"); se faltar, soma as semanas.
function totalDoPeriodo(ev, publico) {
  if (ev.total && ev.total[publico]) return ev.total[publico];
  let n = 0; let pos = 0; let neg = 0; let neu = 0;
  for (const s of ev.semanas) {
    const r = resultado(s, publico);
    if (!r.n) continue;
    n += r.n; pos += r.pos * r.n; neg += r.neg * r.n; neu += r.neu * r.n;
  }
  if (!n) return { n: 0 };
  return { n, pos: pos / n, neg: neg / n, neu: neu / n, saldo: (pos - neg) / n, margem: null, amostra_baixa: n < 30 };
}

// Frase curta para o cartão, a partir do saldo (% a favor − % contra) e da margem de erro.
function veredito(r) {
  if (!r || !r.n) return { texto: 'Ainda sem dados', lado: null };
  if (r.amostra_baixa) return { texto: 'Poucos dados para concluir', lado: null };
  const s = r.saldo;
  if (Math.abs(s) < 10 || (r.margem && Math.abs(s) <= r.margem)) return { texto: 'Reação dividida', lado: 'neu' };
  if (s <= -30) return { texto: 'Reação bem mais contra', lado: 'neg' };
  if (s < 0) return { texto: 'Reação mais contra', lado: 'neg' };
  if (s >= 30) return { texto: 'Reação bem mais a favor', lado: 'pos' };
  return { texto: 'Reação mais a favor', lado: 'pos' };
}

async function iniciar() {
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cor('--texto-2');
    Chart.defaults.borderColor = cor('--grade');
    Chart.defaults.plugins.tooltip.backgroundColor = cor('--preto-cf');
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 4;
  }
  try {
    const resp = await fetch(URL_DADOS, { cache: 'no-store' });
    estado.dados = await resp.json();
  } catch (erro) {
    document.getElementById('evento-titulo').textContent = 'Não foi possível carregar os dados.';
    return;
  }
  const d = estado.dados;
  document.getElementById('atualizado').textContent = `Atualizado em ${dataBR(d.atualizado_em)}`;
  document.getElementById('aviso-classificacao').hidden = !!d.classificacao_pronta;

  const nav = document.getElementById('eventos');
  d.eventos.forEach((ev, i) => {
    const b = el('button', ev.titulo);
    b.type = 'button';
    b.addEventListener('click', () => escolherEvento(i));
    nav.appendChild(b);
  });
  document.querySelectorAll('.alternar button').forEach((b) => {
    b.addEventListener('click', () => escolherPublico(b.dataset.publico));
  });
  mostrarQualidade(d.qualidade || {});
  escolherEvento(0);
}

function escolherEvento(i) {
  const ev = estado.dados.eventos[i];
  estado.evento = ev;
  document.querySelectorAll('#eventos button').forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  document.getElementById('evento-titulo').textContent = ev.titulo;
  const det = document.getElementById('evento-detalhe');
  const n = ev.semanas.length;
  det.textContent = `Anunciada em ${dataBR(ev.data)} · ${n} semana${n === 1 ? '' : 's'} acompanhada${n === 1 ? '' : 's'} · `;
  if (ev.fonte_url) {
    const a = el('a', 'notícia de origem');
    a.href = ev.fonte_url; a.target = '_blank'; a.rel = 'noopener';
    det.appendChild(a);
  }
  if (ev.encerrado_na_semana) {
    det.appendChild(document.createTextNode(` · acompanhamento encerrado na semana ${ev.encerrado_na_semana}`));
  }
  const temSemanas = n > 0;
  for (const id of ['resumo', 'legenda', 'secao-semanas']) document.getElementById(id).hidden = !temSemanas;
  if (temSemanas) {
    preencherCartao(document.getElementById('card-publico'), ev, 'publico');
    preencherCartao(document.getElementById('card-mercado'), ev, 'mercado');
    desenharSemanas();
    preencherTabelas(ev);
  }
  desenharPrecos(ev);
}

function escolherPublico(publico) {
  estado.publico = publico;
  document.querySelectorAll('.alternar button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.publico === publico)));
  desenharSemanas();
}

// 1. Cartão de resumo: frase, número principal, barra única e de onde vêm os números.
function preencherCartao(caixa, ev, publico) {
  const nome = NOMES[publico];
  const r = totalDoPeriodo(ev, publico);
  const v = veredito(r);
  caixa.replaceChildren();
  caixa.classList.toggle('vazio', !v.lado);
  caixa.appendChild(el('p', nome.titulo, 'card-rotulo'));
  caixa.appendChild(el('p', nome.fonte, 'card-fonte'));

  const frase = el('p', undefined, 'veredito');
  frase.appendChild(el('span', undefined, `ponto${v.lado ? ` ${v.lado}` : ''}`));
  frase.appendChild(document.createTextNode(v.texto));
  caixa.appendChild(frase);

  if (r.n) {
    const grande = el('p', undefined, 'numero-grande');
    const apoio = el('p', undefined, 'numero-apoio');
    if (v.lado === 'pos') {
      grande.append(`${num(r.pos, 0)}%`, el('small', 'a favor'));
      apoio.textContent = `${num(r.neg, 0)}% contra · ${num(r.neu, 0)}% neutros`;
    } else if (v.lado === 'neg') {
      grande.append(`${num(r.neg, 0)}%`, el('small', 'contra'));
      apoio.textContent = `${num(r.pos, 0)}% a favor · ${num(r.neu, 0)}% neutros`;
    } else {
      grande.append(`${num(r.pos, 0)}% × ${num(r.neg, 0)}%`, el('small', 'a favor × contra'));
      apoio.textContent = `${num(r.neu, 0)}% neutros`;
    }
    caixa.append(grande, apoio);

    const barra = el('div', undefined, 'barra-total');
    barra.setAttribute('role', 'img');
    barra.setAttribute('aria-label', `${nome.titulo}: ${num(r.pos, 0)}% a favor, ${num(r.neu, 0)}% neutros, ${num(r.neg, 0)}% contra`);
    for (const chave of ['pos', 'neu', 'neg']) {
      if (!r[chave]) continue;
      const s = el('span', undefined, chave);
      s.style.width = `${r[chave]}%`;
      barra.appendChild(s);
    }
    caixa.appendChild(barra);

    let base = `Com base em ${inteiro(r.n)} ${nome.unidade} com posição, no período todo.`;
    const primeira = resultado(ev.semanas[0], publico).n;
    if (publico === 'mercado' && primeira && primeira / r.n >= 0.5) {
      base = `Com base em ${inteiro(r.n)} notícias com posição; ${num(100 * primeira / r.n, 0)}% delas saíram na primeira semana.`;
    }
    caixa.appendChild(el('p', base, 'card-base'));
  }

  const ressalvas = (estado.dados.qualidade && estado.dados.qualidade.ressalvas) || {};
  if (ressalvas[publico]) caixa.appendChild(el('p', ressalvas[publico], 'ressalva ressalva-linha'));
}

function trocarGrafico(nome, config) {
  if (estado.graficos[nome]) estado.graficos[nome].destroy();
  if (typeof Chart === 'undefined') return;
  estado.graficos[nome] = new Chart(document.getElementById(nome), config);
}

function tituloSemana(s) {
  return `Semana ${s.semana} · ${dataBR(s.inicio, false)} a ${dataBR(s.fim, false)}`;
}

// 2. Barras empilhadas de 100%, uma por semana, para o lado escolhido no botão.
function desenharSemanas() {
  const ev = estado.evento;
  const publico = estado.publico;
  const nome = NOMES[publico];
  const semanas = ev.semanas;
  const rs = semanas.map((s) => resultado(s, publico));
  const fracas = rs.filter(semAmostra).length;
  document.getElementById('semanas-detalhe').textContent =
    `Cada barra é uma semana desde o anúncio e mostra como se dividiram ${nome.artigo} ${nome.unidade} daquela semana.`
    + (fracas ? ' Barras claras têm menos de 30 textos: leia com cuidado.' : '')
    + (publico === 'mercado' ? ' Quase todas as notícias saem logo depois do anúncio.' : '');

  const fatia = (chave, rotulo, corBase) => ({
    label: rotulo,
    data: rs.map((r) => (r.n ? r[chave] : null)),
    backgroundColor: rs.map((r) => (semAmostra(r) ? comAlfa(corBase, 0.3) : corBase)),
    hoverBackgroundColor: rs.map((r) => (semAmostra(r) ? comAlfa(corBase, 0.45) : corBase)),
    borderColor: cor('--superficie'),
    borderWidth: 1,
    borderSkipped: false,
    maxBarThickness: 72,
  });
  // Rótulo embaixo de cada barra: semana e n. Em tela estreita (celular), versão curta, sem pular semanas.
  const rotuloLongo = (s, r) => [`Sem. ${s.semana}`, r.n ? `n = ${r.n}` : 'sem dados'];
  const rotuloCurto = (s, r) => [`S${s.semana}`, r.n ? `${r.n}` : '0'];
  trocarGrafico('grafico-semanas', {
    type: 'bar',
    data: {
      labels: semanas.map((s) => `Sem. ${s.semana}`),
      datasets: [fatia('pos', 'A favor', cor('--pos')), fatia('neu', 'Neutro', cor('--neu')), fatia('neg', 'Contra', cor('--neg'))],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            color: cor('--texto-2'), autoSkip: false, maxRotation: 0,
            callback(_valor, i) {
              const curto = this.chart.width < 64 * semanas.length;
              return (curto ? rotuloCurto : rotuloLongo)(semanas[i], rs[i]);
            },
          },
        },
        y: { stacked: true, min: 0, max: 100, ticks: { stepSize: 25, callback: (v) => `${v}%` } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item) => item.parsed.y !== null,
          callbacks: {
            // Numa semana sem textos, o filtro tira todos os itens: a semana vem do elemento ativo.
            title(itens) {
              const i = itens.length ? itens[0].dataIndex : (this.getActiveElements()[0] || {}).index;
              return i === undefined ? '' : tituloSemana(semanas[i]);
            },
            label: (c) => ` ${c.dataset.label}: ${num(c.parsed.y, 0)}%`,
            footer(itens) {
              const i = itens.length ? itens[0].dataIndex : (this.getActiveElements()[0] || {}).index;
              if (i === undefined) return '';
              const r = rs[i];
              if (!r.n) return `Sem ${nome.unidade} com posição nesta semana.`;
              return [`${r.n} ${nome.unidade} com posição`].concat(r.amostra_baixa ? ['Poucos textos: leia com cuidado'] : []);
            },
          },
        },
      },
    },
  });
}

function preencherTabelas(ev) {
  const caixa = document.getElementById('tabelas-semanas');
  caixa.replaceChildren();
  for (const publico of ['publico', 'mercado']) {
    caixa.appendChild(el('h3', `${NOMES[publico].titulo} (${NOMES[publico].fonte})`));
    const rolagem = el('div', undefined, 'rolagem');
    const tabela = el('table', undefined, 'tabela');
    const cab = el('tr');
    ['Semana', 'Datas', 'A favor', 'Neutro', 'Contra', 'Saldo (p.p.)', 'Margem', 'Textos', 'Fora do tema']
      .forEach((t) => cab.appendChild(el('th', t)));
    tabela.appendChild(el('thead')).appendChild(cab);
    const corpo = el('tbody');
    for (const s of ev.semanas) {
      const r = resultado(s, publico);
      const tr = el('tr', undefined, semAmostra(r) ? 'baixa' : undefined);
      const celulas = r.n
        ? [`${num(r.pos, 0)}%`, `${num(r.neu, 0)}%`, `${num(r.neg, 0)}%`, sinal(r.saldo),
          r.amostra_baixa ? 'poucos textos' : `±${num(r.margem)}`, String(r.n), String(r.fora || 0)]
        : ['—', '—', '—', '—', '—', '0', String(r.fora || 0)];
      [String(s.semana), `${dataBR(s.inicio, false)} a ${dataBR(s.fim, false)}`, ...celulas]
        .forEach((t) => tr.appendChild(el('td', t)));
      corpo.appendChild(tr);
    }
    tabela.appendChild(corpo);
    rolagem.appendChild(tabela);
    caixa.appendChild(rolagem);
  }
}

// Linhas tracejadas verticais com um rótulo curto (as datas de MARCOS) no gráfico de preços.
const pluginMarcos = {
  id: 'marcos',
  afterDatasetsDraw(chart, _args, opcoes) {
    const itens = (opcoes && opcoes.itens) || [];
    if (!itens.length) return;
    const { ctx, chartArea, scales: { x } } = chart;
    const passo = x.getPixelForValue(1) - x.getPixelForValue(0);
    ctx.save();
    ctx.strokeStyle = cor('--texto-3');
    ctx.fillStyle = cor('--texto-2');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    for (const m of itens) {
      const px = x.getPixelForValue(m.indice) - passo / 2;
      ctx.beginPath();
      ctx.moveTo(px, chartArea.top);
      ctx.lineTo(px, chartArea.bottom);
      ctx.stroke();
      ctx.fillText(m.texto, px + 4, chartArea.top + 12);
    }
    ctx.restore();
  },
};

function ultimoValor(serie, chave) {
  for (let i = serie.length - 1; i >= 0; i -= 1) {
    if (serie[i][chave] !== null && serie[i][chave] !== undefined) return serie[i];
  }
  return null;
}

// 3. Preços: dois números grandes e o gráfico, só como contexto.
function desenharPrecos(ev) {
  const serie = (ev.precos && ev.precos.serie) || [];
  const vespera = ev.precos && ev.precos.vespera;
  document.getElementById('precos-detalhe').textContent = vespera
    ? `Variação desde a véspera do anúncio (${dataBR(vespera)}). É só contexto: os preços mudam por muitos motivos, como os turnos da eleição (linhas tracejadas), e não medem a reação.`
    : 'Preços ainda não coletados.';

  const t = document.getElementById('termometro');
  t.replaceChildren();
  for (const [nome, chave] of [['Dólar (PTAX)', 'dolar'], ['Ibovespa', 'ibovespa']]) {
    const ultimo = ultimoValor(serie, chave);
    const caixa = el('div', undefined, 'medidor');
    caixa.appendChild(el('div', ultimo ? `${nome} · até ${dataBR(ultimo.data, false)}` : nome, 'nome'));
    caixa.appendChild(el('div', ultimo ? `${sinal(ultimo[chave], 2)}%` : '—', 'valor'));
    t.appendChild(caixa);
  }

  const marcos = MARCOS.map((m) => ({ ...m, indice: serie.findIndex((r) => r.data >= m.data) }))
    .filter((m) => m.indice > 0);
  trocarGrafico('grafico-precos', {
    type: 'line',
    data: {
      labels: serie.map((r) => dataBR(r.data, false)),
      datasets: [
        { label: 'Dólar (PTAX)', data: serie.map((r) => r.dolar), borderColor: cor('--linha-1'), backgroundColor: cor('--linha-1'),
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: true },
        { label: 'Ibovespa', data: serie.map((r) => r.ibovespa), borderColor: cor('--linha-2'), backgroundColor: cor('--linha-2'),
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: true },
      ],
    },
    plugins: [pluginMarcos],
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
        y: {
          ticks: { callback: (v) => (v === 0 ? '0%' : `${sinal(v, 0)}%`) },
          grid: { color: (c) => (c.tick.value === 0 ? cor('--texto-3') : cor('--grade')) },
        },
      },
      plugins: {
        marcos: { itens: marcos },
        legend: { position: 'top', align: 'start', labels: { usePointStyle: true, pointStyle: 'line', color: cor('--texto') } },
        tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${sinal(c.parsed.y, 2)}%` } },
      },
    },
  });
}

// 4. Qualidade do modelo e limitações (dentro de "Sobre os números").
function mostrarQualidade(q) {
  document.getElementById('qualidade-metodo').textContent = q.metodo || '';
  document.getElementById('qualidade-comparacao').textContent = q.comparacao || '';
  const corpoV = document.querySelector('#tabela-validacao tbody');
  (q.validacao || []).forEach((v) => {
    const tr = el('tr');
    tr.append(el('td', v.recorte), el('td', String(v.n)), el('td', num(v.macro_f1, 2)), el('td', v.ic));
    corpoV.appendChild(tr);
  });
  document.getElementById('nota-validacao').textContent =
    (q.provisorio ? 'Provisório. ' : '') + (q.nota_validacao || '');
  const corpoC = document.querySelector('#tabela-concordancia tbody');
  (q.concordancia || []).forEach((c) => {
    const tr = el('tr');
    tr.append(el('td', c.base), el('td', num(c.kappa, 2)));
    corpoC.appendChild(tr);
  });
  document.getElementById('nota-concordancia').textContent = q.nota_concordancia || '';
  document.getElementById('filtro-fora').textContent = q.filtro_fora || '';
  const lista = document.getElementById('limitacoes');
  (q.limitacoes || []).forEach((t) => lista.appendChild(el('li', t)));
}

document.addEventListener('DOMContentLoaded', iniciar);

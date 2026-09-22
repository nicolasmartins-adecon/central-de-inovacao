/* =============================================================================
   UI — construção de DOM, ícones, avisos, modal, gaveta e utilidades de data.
   ========================================================================== */

window.CI = window.CI || {};

CI.ui = (function () {

  /* ---- hiperscript minimalista ----------------------------------------- */
  // h("div.classe#id", { onclick, dataset:{}, ... }, filhos...)
  function h(seletor, props, ...filhos) {
    const [tagEId, ...classes] = String(seletor).split(".");
    const [tag, id] = tagEId.split("#");
    const el = document.createElement(tag || "div");
    if (id) el.id = id;
    if (classes.length) el.className = classes.join(" ");

    if (props && (props.nodeType || Array.isArray(props) || typeof props === "string")) {
      filhos.unshift(props);
      props = null;
    }

    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className += (el.className ? " " : "") + v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "texto") el.textContent = v;
      // Object.assign não grava custom properties (--tom, --cel): precisa de setProperty
      else if (k === "estilo") {
        for (const [prop, valor] of Object.entries(v)) {
          if (valor === null || valor === undefined || valor === false) continue;
          if (prop.startsWith("--")) el.style.setProperty(prop, String(valor));
          else el.style[prop] = valor;
        }
      }
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k in el && k !== "list" && typeof v !== "object") { try { el[k] = v; } catch (_) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? "" : v);
    }

    anexar(el, filhos);
    return el;
  }

  function anexar(pai, filhos) {
    for (const f of filhos.flat(4)) {
      if (f === null || f === undefined || f === false || f === "") continue;
      pai.appendChild(f.nodeType ? f : document.createTextNode(String(f)));
    }
  }

  function limpar(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* ---- ícones ----------------------------------------------------------- */
  const CAMINHOS = {
    painel:      "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    cronograma:  "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M6.5 14h5M10.5 17.5h6",
    camadas:     "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    colunas:     "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z",
    tomada:      "M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4",
    pulso:       "M22 12h-4l-3 9L9 3l-3 9H2",
    ajustes:     "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
    busca:       "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.3-4.3",
    mais:        "M12 5v14M5 12h14",
    check:       "M20 6 9 17l-5-5",
    relogio:     "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2",
    balao:       "M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 21l1.9-5A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z",
    lixeira:     "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
    lapis:       "M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z",
    x:           "M18 6 6 18M6 6l12 12",
    alerta:      "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01",
    raio:        "M13 2 3 14h9l-1 8 10-12h-9z",
    usuario:     "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    sair:        "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
    menu:        "M3 6h18M3 12h18M3 18h18",
    sol:         "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    lua:         "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
    recarregar:  "M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15",
    baixar:      "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    correio:     "M4 4h16v16H4zM4 6l8 6 8-6",
    externo:     "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
    arquivo:     "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7",
    alvo:        "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
    caixa:       "M22 12h-6l-2 3h-4l-2-3H2M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z",
    setaDir:     "M5 12h14M12 5l7 7-7 7",
    setaEsq:     "M19 12H5M12 19l-7-7 7-7",
    elo:         "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
    plugue:      "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12l3 3 5-6",
    bandeira:    "M4 22V4a6 6 0 0 1 8 0 6 6 0 0 0 8 0v10a6 6 0 0 1-8 0 6 6 0 0 0-8 0z",
    arrastar:    "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
    tocar:       "M7.5 4.8v14.4l11.5-7.2z",
    pausa:       "M9.5 5v14M14.5 5v14"
  };

  function ic(nome, tamanho) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    if (tamanho) { svg.style.width = tamanho + "px"; svg.style.height = tamanho + "px"; }
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", CAMINHOS[nome] || CAMINHOS.alvo);
    svg.appendChild(p);
    return svg;
  }

  function svgEl(tag, attrs, ...filhos) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, v);
    }
    filhos.flat(3).forEach(f => f && el.appendChild(f.nodeType ? f : document.createTextNode(String(f))));
    return el;
  }

  /* ---- datas ------------------------------------------------------------ */
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
                 "julho","agosto","setembro","outubro","novembro","dezembro"];
  const MESES_C = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];

  function hojeISO() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }

  function paraData(iso) {
    if (!iso) return null;
    const s = String(iso).slice(0, 10);
    const [a, m, d] = s.split("-").map(Number);
    if (!a || !m || !d) return null;
    return new Date(a, m - 1, d);
  }

  function dataBR(iso) {
    const d = paraData(iso);
    if (!d) return "—";
    return String(d.getDate()).padStart(2, "0") + "/" +
           String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }

  function dataExtenso(iso) {
    const d = paraData(iso);
    if (!d) return "—";
    return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  }

  function diasAte(iso) {
    const d = paraData(iso);
    if (!d) return null;
    const hoje = paraData(hojeISO());
    return Math.round((d - hoje) / 86400000);
  }

  function relativo(instante) {
    if (!instante) return "";
    const t = new Date(instante).getTime();
    if (Number.isNaN(t)) return "";
    const seg = Math.round((Date.now() - t) / 1000);
    if (seg < 60) return "agora";
    if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
    if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
    const dias = Math.floor(seg / 86400);
    if (dias < 30) return `há ${dias} d`;
    return dataBR(new Date(t).toISOString());
  }

  /* ---- avisos (toasts) --------------------------------------------------- */
  let caixaAvisos = null;

  function aviso(texto, tom = "ok", icone) {
    if (!caixaAvisos) {
      caixaAvisos = h("div.avisos", { role: "status", "aria-live": "polite" });
      document.body.appendChild(caixaAvisos);
    }
    const cores = { ok: "var(--ok)", erro: "var(--crit)", alerta: "var(--warn)", info: "var(--accent)" };
    const icones = { ok: "check", erro: "alerta", alerta: "alerta", info: "raio" };
    const el = h("div.aviso", { estilo: { "--tom": cores[tom] || cores.info } },
      ic(icone || icones[tom] || "raio"),
      h("span", texto)
    );
    caixaAvisos.appendChild(el);
    setTimeout(() => {
      el.classList.add("saindo");
      setTimeout(() => el.remove(), 260);
    }, tom === "erro" ? 5200 : 3200);
    return el;
  }

  /* ---- cortina compartilhada --------------------------------------------- */
  let cortina = null;
  let aoFechar = null;

  function mostrarCortina(fechar) {
    if (!cortina) {
      cortina = h("div.cortina", { onclick: () => aoFechar && aoFechar() });
      document.body.appendChild(cortina);
    }
    aoFechar = fechar;
    cortina.hidden = false;
    requestAnimationFrame(() => cortina.classList.add("aberta"));
  }

  function esconderCortina() {
    if (!cortina) return;
    cortina.classList.remove("aberta");
    setTimeout(() => { if (cortina && !cortina.classList.contains("aberta")) cortina.hidden = true; }, 240);
    aoFechar = null;
  }

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (modalAtual) fecharModal();
    else if (gavetaAtual) fecharGaveta();
  });

  /* ---- modal -------------------------------------------------------------- */
  let modalAtual = null;

  /**
   * abrirModal({ titulo, sub, corpo:[nós], acoes:[nós], aoAbrir(el) })
   */
  function abrirModal({ titulo, sub, corpo = [], acoes = [], largura, aoAbrir }) {
    fecharModal(true);
    const bd = h("div.modal-bd", corpo);
    const el = h("div.modal", { role: "dialog", "aria-modal": "true", "aria-label": titulo },
      h("div.modal-hd",
        h("div", { estilo: { minWidth: 0 } },
          sub ? h("div.rotulo", sub) : null,
          h("h2", titulo)
        ),
        h("button.btn.btn-fantasma.btn-icone", {
          type: "button", "aria-label": "Fechar", onclick: () => fecharModal()
        }, ic("x"))
      ),
      bd,
      acoes.length ? h("div.modal-pe", acoes) : null
    );
    if (largura) el.style.width = `min(${largura}px, calc(100vw - 32px))`;
    document.body.appendChild(el);
    modalAtual = el;
    mostrarCortina(() => fecharModal());
    requestAnimationFrame(() => {
      el.classList.add("aberto");
      const foco = el.querySelector("input,textarea,select,button");
      foco && foco.focus();
      aoAbrir && aoAbrir(el);
    });
    return el;
  }

  function fecharModal(imediato) {
    if (!modalAtual) return;
    const el = modalAtual;
    modalAtual = null;
    if (imediato) { el.remove(); return; }
    el.classList.remove("aberto");
    if (!gavetaAtual) esconderCortina();
    setTimeout(() => el.remove(), 220);
  }

  /** Diálogo de confirmação. Resolve true/false. */
  function confirmar(titulo, texto, rotuloOk = "Confirmar", perigo = true) {
    return new Promise(resolve => {
      let resolvido = false;
      const fim = v => { if (!resolvido) { resolvido = true; resolve(v); } fecharModal(); };
      abrirModal({
        titulo,
        largura: 460,
        corpo: [h("p", { estilo: { color: "var(--txt-2)", lineHeight: "1.6" } }, texto)],
        acoes: [
          h("button.btn", { type: "button", onclick: () => fim(false) }, "Cancelar"),
          h(perigo ? "button.btn.btn-primario" : "button.btn.btn-primario", {
            type: "button",
            estilo: perigo ? { background: "var(--crit)", borderColor: "var(--crit)", color: "#fff", boxShadow: "none" } : {},
            onclick: () => fim(true)
          }, rotuloOk)
        ]
      });
    });
  }

  /* ---- gaveta ------------------------------------------------------------- */
  let gavetaAtual = null;

  function abrirGaveta({ rotulo, titulo, acoesCabecalho = [], corpo = [] }) {
    fecharGaveta(true);
    const el = h("aside.gaveta", { role: "dialog", "aria-modal": "true", "aria-label": titulo },
      h("div.gaveta-hd",
        h("div", { estilo: { minWidth: 0, flex: "1 1 auto" } },
          rotulo ? h("div.rotulo", rotulo) : null,
          h("h2", titulo)
        ),
        ...acoesCabecalho,
        h("button.btn.btn-fantasma.btn-icone", {
          type: "button", "aria-label": "Fechar", onclick: () => fecharGaveta()
        }, ic("x"))
      ),
      h("div.gaveta-bd", corpo)
    );
    document.body.appendChild(el);
    gavetaAtual = el;
    mostrarCortina(() => fecharGaveta());
    requestAnimationFrame(() => el.classList.add("aberta"));
    return el;
  }

  function fecharGaveta(imediato) {
    if (!gavetaAtual) return;
    const el = gavetaAtual;
    gavetaAtual = null;
    if (imediato) { el.remove(); return; }
    el.classList.remove("aberta");
    if (!modalAtual) esconderCortina();
    setTimeout(() => el.remove(), 300);
  }

  const gavetaAberta = () => Boolean(gavetaAtual);

  /* ---- peças reutilizáveis ------------------------------------------------ */

  function chip(texto, variante, tom) {
    const el = h("span.chip" + (variante ? ".chip-" + variante : ""),
      tom ? h("i.ponto", { estilo: { background: tom } }) : null, texto);
    if (tom && !variante) el.style.color = tom;
    return el;
  }

  /** Mostrador em anel. pct 0–100. */
  function anel(pct, tom, tamanho = 62, espessura = 6) {
    const r = (tamanho - espessura) / 2;
    const c = 2 * Math.PI * r;
    const v = Math.max(0, Math.min(100, Number(pct) || 0));
    const svg = svgEl("svg", { viewBox: `0 0 ${tamanho} ${tamanho}`, class: "kpi-mostrador", role: "img",
                               "aria-label": `${Math.round(v)} por cento` },
      svgEl("circle", { class: "anel-fundo", cx: tamanho / 2, cy: tamanho / 2, r, "stroke-width": espessura }),
      svgEl("circle", {
        class: "anel-valor", cx: tamanho / 2, cy: tamanho / 2, r, "stroke-width": espessura,
        "stroke-dasharray": c, "stroke-dashoffset": c,
        transform: `rotate(-90 ${tamanho / 2} ${tamanho / 2})`
      }),
      svgEl("text", {
        x: tamanho / 2, y: tamanho / 2 + 4, "text-anchor": "middle",
        class: "gr-txt-forte", "font-size": tamanho > 74 ? 15 : tamanho > 54 ? 12 : 11
      }, Math.round(v) + "%")
    );
    if (tom) svg.style.setProperty("--tom", tom);
    requestAnimationFrame(() => {
      const arco = svg.querySelector(".anel-valor");
      if (arco) arco.setAttribute("stroke-dashoffset", String(c * (1 - v / 100)));
    });
    return svg;
  }

  function vazio(icone, titulo, texto, acao) {
    return h("div.vazio", ic(icone), h("h3", titulo), texto ? h("p", texto) : null, acao || null);
  }

  function campo(rotulo, controle, dica) {
    return h("label.campo",
      h("span", { class: "", estilo: { font: "600 10px/1 var(--f-dado)", letterSpacing: ".13em",
                                       textTransform: "uppercase", color: "var(--muted)" } }, rotulo),
      controle,
      dica ? h("span", { estilo: { fontSize: "11px", color: "var(--faint)" } }, dica) : null
    );
  }

  function entrada(props) { return h("input.entrada", Object.assign({ type: "text" }, props)); }
  function area(props) { return h("textarea.entrada", props || {}); }
  function selecao(opcoes, props) {
    return h("select.entrada", props || {},
      ...opcoes.map(o => {
        const [valor, texto] = Array.isArray(o) ? o : [o, o];
        return h("option", { value: valor, selected: props && props.value === valor }, texto);
      })
    );
  }

  function iniciais(nome) {
    return String(nome || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0] || "").join("").toUpperCase() || "?";
  }

  function escapar(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---- cor -----------------------------------------------------------------
     As diretorias têm cores de marca — inclusive preto e roxo escuro, que
     desapareceriam sobre o fundo de tinta do tema escuro. Guardamos sempre a
     cor real e só ajustamos a luminosidade na hora de desenhar, mantendo o
     matiz. Assim o preto da Presidência vira grafite no escuro e volta a ser
     preto no tema claro.
     -------------------------------------------------------------------------- */

  function hexRgb(hex) {
    let s = String(hex || "").trim().replace(/^#/, "");
    if (s.length === 3) s = s.split("").map(c => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  function rgbHex(rgb) {
    return "#" + rgb.map(v =>
      Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  }

  function rgbHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hue = 0;
    if (d) {
      if (mx === r) hue = ((g - b) / d) % 6;
      else if (mx === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return [hue, s, l];
  }

  function hslRgb(hue, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  function luminancia(rgb) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  }

  function temaEscuro() {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t === "dark";
    return !window.matchMedia("(prefers-color-scheme: light)").matches;
  }

  /** Cor de marca ajustada para ficar legível no tema atual. */
  function corVisivel(hex) {
    const rgb = hexRgb(hex);
    if (!rgb) return hex || "var(--muted)";
    let [hue, s, l] = rgbHsl(rgb);
    if (temaEscuro()) {
      if (l < 0.30) { l = 0.58; if (s < 0.12) s = 0.10; }   // preto -> grafite
    } else {
      if (l > 0.82) l = 0.62;                                // pastel demais -> firma
    }
    return rgbHex(hslRgb(hue, s, l));
  }

  /** Preto ou branco, o que contrastar melhor com a cor de fundo dada. */
  function corTexto(hex) {
    const rgb = hexRgb(corVisivel(hex));
    if (!rgb) return "#0A0E14";
    return luminancia(rgb) > 0.40 ? "#0A0E14" : "#F4F8FC";
  }

  /** Véu para marcar progresso por cima de uma barra colorida. */
  function veu(hex) {
    return corTexto(hex) === "#0A0E14" ? "rgba(8,12,17,.28)" : "rgba(255,255,255,.30)";
  }

  return {
    h, anexar, limpar, ic, svgEl,
    MESES, MESES_C, hojeISO, paraData, dataBR, dataExtenso, diasAte, relativo,
    aviso, abrirModal, fecharModal, confirmar,
    abrirGaveta, fecharGaveta, gavetaAberta,
    chip, anel, vazio, campo, entrada, area, selecao, iniciais, escapar,
    corVisivel, corTexto, veu, temaEscuro, luminancia
  };
})();

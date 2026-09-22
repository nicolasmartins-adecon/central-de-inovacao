/* =============================================================================
   APLICAÇÃO — casca, navegação, roteador e arranque.
   ========================================================================== */

window.CI = window.CI || {};

CI.app = (function () {
  const U = CI.ui;
  const { h, ic } = U;
  const db = CI.db;
  const V = CI.views;

  const ROTAS = [
    { id: "inicio",        hash: "#/inicio",        nome: "Início",        icone: "raio",       grupo: "Acompanhar",
      titulo: "Central de Inovação", rotulo: "página inicial" },
    { id: "painel",        hash: "#/painel",        nome: "Painel",        icone: "painel",     grupo: "Acompanhar",
      titulo: "Painel de controle", rotulo: "visão geral do ciclo" },
    { id: "cronograma",    hash: "#/cronograma",    nome: "Cronograma",    icone: "cronograma", grupo: "Acompanhar",
      titulo: "Cronograma", rotulo: "calendarização por semana" },
    { id: "projetos",      hash: "#/projetos",      nome: "Projetos",      icone: "camadas",    grupo: "Acompanhar",
      titulo: "Projetos", rotulo: "carteira de ações internas" },
    { id: "diretorias",    hash: "#/diretorias",    nome: "Diretorias",    icone: "colunas",    grupo: "Estruturar",
      titulo: "Diretorias", rotulo: "iniciativas, processos e ferramentas" },
    { id: "implementacao", hash: "#/implementacao", nome: "Implementação", icone: "tomada",     grupo: "Estruturar",
      titulo: "Implementação", rotulo: "o que já entrou em uso" },
    { id: "indicadores",   hash: "#/indicadores",   nome: "Indicadores",   icone: "pulso",      grupo: "Estruturar",
      titulo: "Indicadores", rotulo: "TIP, ISD e inovação" },
    { id: "config",        hash: "#/config",        nome: "Conexão",       icone: "ajustes",    grupo: "Sistema",
      titulo: "Conexão e dados", rotulo: "supabase, e-mails e backup" }
  ];

  let rotaAtual = "painel";
  let paramAtual = null;
  let raiz, casca, elConteudo, elTitulo, elRotulo, elNav, elConexao, elBusca, elResultados;

  /* ---- tema --------------------------------------------------------------- */

  function temaSalvo() {
    try { return localStorage.getItem("ci:tema") || ""; } catch (_) { return ""; }
  }
  function aplicarTema(t) {
    if (t) document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    try { t ? localStorage.setItem("ci:tema", t) : localStorage.removeItem("ci:tema"); } catch (_) {}
  }
  const temaEscuroAtivo = () => U.temaEscuro();

  /* ---- casca -------------------------------------------------------------- */

  function montarCasca() {
    elNav = h("nav.rail-nav", { "aria-label": "Seções" });

    elConexao = h("button.conexao", {
      type: "button", dataset: { estado: "local" }, title: "Estado da conexão",
      onclick: () => (location.hash = "#/config")
    }, h("i.led"), h("div.conexao-txt", h("div.conexao-t", "Modo local"), h("div.conexao-s", "sem servidor")));

    const rail = h("aside.rail",
      h("div.marca",
        h("div.marca-selo", U.svgEl("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "#fff", "stroke-width": "1.8",
            "stroke-linecap": "round", "stroke-linejoin": "round" },
          U.svgEl("path", { d: "M12 3v5M12 16v5M3 12h5M16 12h5M6.3 6.3l3.2 3.2M14.5 14.5l3.2 3.2M17.7 6.3l-3.2 3.2M9.5 14.5l-3.2 3.2" }),
          U.svgEl("circle", { cx: "12", cy: "12", r: "3.1", fill: "#fff", stroke: "none" })
        )),
        h("div.marca-txt",
          h("div.marca-nome", "Central de Inovação"),
          h("div.marca-sub", (window.CI_CONFIG || {}).EMPRESA || "Adecon")
        )
      ),
      elNav,
      h("div.rail-pe",
        elConexao,
        h("button.nav-item", {
          type: "button", title: "Alternar tema",
          onclick: e => {
            aplicarTema(temaEscuroAtivo() ? "light" : "dark");
            desenharNav();
            recarregarVista();          // as cores de marca são recalculadas para o tema
            e.currentTarget.blur();
          }
        }, ic(temaEscuroAtivo() ? "sol" : "lua"), h("span", temaEscuroAtivo() ? "Tema claro" : "Tema escuro"))
      )
    );

    elTitulo = h("h1", "Painel de controle");
    elRotulo = h("div.rotulo", "visão geral do ciclo");
    elResultados = h("div", {
      estilo: {
        position: "absolute", top: "calc(100% + 7px)", right: 0, width: "min(430px, 88vw)",
        background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--r-md)",
        boxShadow: "var(--sombra-alta)", overflow: "hidden", zIndex: 50, display: "none"
      }
    });

    elBusca = h("input", {
      type: "search", placeholder: "Buscar projeto ou etapa…", "aria-label": "Buscar",
      id: "busca-global",
      oninput: e => desenharBusca(e.target.value),
      onfocus: e => e.target.value && desenharBusca(e.target.value),
      onkeydown: e => {
        if (e.key === "Escape") { e.target.value = ""; elResultados.style.display = "none"; e.target.blur(); }
        if (e.key === "Enter") { const b = elResultados.querySelector("button"); b && b.click(); }
      }
    });

    const caixaBusca = h("div", { estilo: { position: "relative", marginLeft: "auto" } },
      h("div.busca", ic("busca"), elBusca, h("kbd", "/")),
      elResultados
    );

    const topbar = h("header.topbar",
      h("button.btn.btn-fantasma.btn-icone.abrir-rail", {
        type: "button", "aria-label": "Abrir menu",
        onclick: () => casca.classList.toggle("rail-aberto")
      }, ic("menu")),
      h("div.topbar-titulo", elRotulo, elTitulo),
      caixaBusca,
      h("button.btn.btn-fantasma.btn-icone", {
        type: "button", "aria-label": "Atualizar dados", title: "Atualizar",
        onclick: async () => { await db.recarregar(); recarregarVista(); U.aviso("Dados atualizados", "ok"); }
      }, ic("recarregar")),
      h("button.btn.btn-primario", {
        type: "button", onclick: () => V.modalProjeto()
      }, ic("mais"), h("span", { estilo: { display: "inline" } }, "Novo"))
    );

    elConteudo = h("main.conteudo", { id: "conteudo", tabindex: "-1" });

    casca = h("div.app", rail, h("div.principal", topbar, elConteudo));
    U.limpar(raiz).appendChild(casca);

    // fecha o menu móvel ao clicar no conteúdo
    elConteudo.addEventListener("click", () => casca.classList.remove("rail-aberto"));

    desenharNav();
    atualizarConexao();
  }

  function desenharNav() {
    U.limpar(elNav);
    let grupo = null;
    const contagens = {
      projetos: db.dados.projetos.length,
      diretorias: db.dados.diretorias.filter(d => d.conta_no_total !== false).length,
      implementacao: db.dados.implementacoes.length
    };
    ROTAS.forEach(r => {
      if (r.grupo !== grupo) { grupo = r.grupo; elNav.appendChild(h("div.nav-grupo", grupo)); }
      elNav.appendChild(h("button.nav-item", {
        type: "button",
        "aria-current": rotaAtual === r.id ? "page" : null,
        title: r.nome,
        onclick: () => { location.hash = r.hash; casca.classList.remove("rail-aberto"); }
      }, ic(r.icone), h("span", r.nome),
        contagens[r.id] ? h("span.nav-cont", String(contagens[r.id])) : null));
    });

    // botão de tema fica no rodapé; atualiza rótulo
    const pe = casca?.querySelector(".rail-pe .nav-item");
    if (pe) {
      U.limpar(pe);
      pe.appendChild(ic(temaEscuroAtivo() ? "sol" : "lua"));
      pe.appendChild(h("span", temaEscuroAtivo() ? "Tema claro" : "Tema escuro"));
    }
  }

  function atualizarConexao() {
    if (!elConexao) return;
    const mapa = { local: "local", conectando: "conectando", online: "online", erro: "erro" };
    elConexao.dataset.estado = mapa[db.estado] || "local";
    const t = elConexao.querySelector(".conexao-t");
    const s = elConexao.querySelector(".conexao-s");
    if (t) t.textContent = db.estado === "online" ? "Supabase" : db.mensagemEstado;
    if (s) {
      s.textContent = db.estado === "online"
        ? (db.usuario?.email || "conectado")
        : db.estado === "local" ? "dados neste navegador"
        : db.estado === "erro" ? "verifique as chaves" : "…";
    }
  }

  /* ---- busca -------------------------------------------------------------- */

  function desenharBusca(termo) {
    const itens = V.buscaGlobal(termo || "");
    U.limpar(elResultados);
    if (!itens.length) {
      elResultados.style.display = termo ? "block" : "none";
      if (termo) elResultados.appendChild(h("div", {
        estilo: { padding: "14px 16px", fontSize: "12.5px", color: "var(--muted)" }
      }, `Nada encontrado para “${termo}”.`));
      return;
    }
    elResultados.style.display = "block";
    itens.forEach(r => {
      elResultados.appendChild(h("button", {
        type: "button",
        estilo: {
          display: "flex", gap: "10px", alignItems: "center", width: "100%", textAlign: "left",
          padding: "10px 14px", background: "none", border: 0,
          borderBottom: "1px solid var(--line-soft)", cursor: "pointer"
        },
        onmouseenter: e => (e.currentTarget.style.background = "var(--panel-2)"),
        onmouseleave: e => (e.currentTarget.style.background = "none"),
        onclick: () => {
          elResultados.style.display = "none";
          elBusca.value = "";
          r.ir();
        }
      },
        h("span.chip", r.tipo),
        h("div", { estilo: { minWidth: 0 } },
          h("div.truncar", { estilo: { fontSize: "13px" } }, r.titulo),
          h("div.truncar", { estilo: { font: "400 11px/1.4 var(--f-dado)", color: "var(--muted)" } }, r.sub)
        )
      ));
    });
  }

  document.addEventListener("click", e => {
    if (elResultados && !e.target.closest(".busca") && !e.target.closest("#conteudo")) {
      if (!elResultados.contains(e.target)) elResultados.style.display = "none";
    }
  });

  document.addEventListener("keydown", e => {
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if ((e.key === "/" && !digitando) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      elBusca?.focus();
      elBusca?.select();
    }
  });

  /* ---- roteador ----------------------------------------------------------- */

  function lerHash() {
    const bruto = (location.hash || "#/inicio").replace(/^#\/?/, "");
    const [nome, param] = bruto.split("/");
    return { nome: nome || "inicio", param: param || null };
  }

  function navegar() {
    const { nome, param } = lerHash();
    rotaAtual = ROTAS.some(r => r.id === nome) || nome === "projeto" ? nome : "inicio";
    paramAtual = param;
    U.fecharGaveta(true);
    U.fecharModal(true);
    desenharNav();
    recarregarVista();
    elConteudo.scrollTop = 0;
  }

  function recarregarVista() {
    if (!elConteudo) return;
    let no, titulo, rotulo;

    try {
      switch (rotaAtual) {
        case "painel":        no = V.vPainel(); break;
        case "cronograma":    no = V.vCronograma(); break;
        case "projetos":      no = V.vProjetos(); break;
        case "projeto":       no = V.vProjeto(paramAtual); break;
        case "diretorias":    no = V.vDiretorias(); break;
        case "implementacao": no = V.vImplementacao(); break;
        case "indicadores":   no = V.vIndicadores(); break;
        case "config":        no = V.vConfig(); break;
        default:              no = V.vInicio(); rotaAtual = "inicio";
      }
    } catch (err) {
      console.error(err);
      no = U.vazio("alerta", "Algo quebrou ao desenhar esta tela", err.message);
    }

    if (rotaAtual === "projeto") {
      const p = db.projeto(paramAtual);
      titulo = p?.nome || "Projeto";
      rotulo = "console do projeto";
    } else {
      const r = ROTAS.find(x => x.id === rotaAtual) || ROTAS[0];
      titulo = r.titulo; rotulo = r.rotulo;
    }

    elTitulo.textContent = titulo;
    elRotulo.textContent = rotulo;
    document.title = `${titulo} · Central de Inovação`;

    U.limpar(elConteudo).appendChild(no);
    atualizarConexao();
  }

  /* ---- portão de entrada (quando há Supabase mas não há sessão) ----------- */

  let portao = null;

  function mostrarPortao() {
    if (portao) return;
    const fEmail = U.entrada({ type: "email", placeholder: "voce@adecon.com.br", autocomplete: "email" });
    const fSenha = U.entrada({ type: "password", placeholder: "Senha (opcional)", autocomplete: "current-password" });
    const recado = h("p", { estilo: { fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.6 } },
      "Este painel está ligado ao banco da empresa. Entre com o e-mail institucional.");

    const entrarLink = async () => {
      if (!fEmail.value.trim()) { U.aviso("Informe seu e-mail.", "alerta"); return; }
      try {
        await db.entrarComLink(fEmail.value.trim());
        recado.textContent = "Link enviado. Abra o e-mail neste mesmo navegador para entrar.";
        recado.style.color = "var(--ok)";
      } catch (e) { U.aviso(e.message, "erro"); }
    };

    portao = h("div.portao",
      h("div.portao-cartao",
        h("div", { estilo: { display: "flex", alignItems: "center", gap: "11px" } },
          h("div.marca-selo", U.svgEl("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "#fff", "stroke-width": "1.8",
              "stroke-linecap": "round", "stroke-linejoin": "round" },
            U.svgEl("path", { d: "M12 3v5M12 16v5M3 12h5M16 12h5M6.3 6.3l3.2 3.2M14.5 14.5l3.2 3.2M17.7 6.3l-3.2 3.2M9.5 14.5l-3.2 3.2" }),
            U.svgEl("circle", { cx: "12", cy: "12", r: "3.1", fill: "#fff", stroke: "none" })
          )),
          h("div",
            h("div", { estilo: { font: "800 16px/1.1 var(--f-display)", letterSpacing: "-.02em" } }, "Central de Inovação"),
            h("div.marca-sub", (window.CI_CONFIG || {}).EMPRESA || "Adecon"))
        ),
        recado,
        U.campo("E-mail", fEmail),
        U.campo("Senha", fSenha, "Deixe em branco para receber um link de acesso."),
        h("div", { estilo: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          h("button.btn.btn-primario", {
            type: "button",
            onclick: async () => {
              if (!fSenha.value) return entrarLink();
              try { await db.entrarComSenha(fEmail.value.trim(), fSenha.value); }
              catch (e) { U.aviso(e.message, "erro"); }
            }
          }, ic("plugue"), "Entrar"),
          h("button.btn", { type: "button", onclick: entrarLink }, ic("correio"), "Receber link")
        ),
        h("button.btn.btn-fantasma", {
          type: "button",
          onclick: () => {
            db.salvarConexao("", "");
            U.aviso("Voltando ao modo local…", "info");
            setTimeout(() => location.reload(), 600);
          }
        }, "Usar sem servidor (modo local)")
      )
    );
    document.body.appendChild(portao);
  }

  function esconderPortao() {
    if (!portao) return;
    portao.remove();
    portao = null;
  }

  /* ---- arranque ----------------------------------------------------------- */

  let pendente = null;
  function aoMudarDados() {
    atualizarConexao();
    desenharNav();
    if (db.motor === "supabase" && !db.usuario) mostrarPortao(); else esconderPortao();
    clearTimeout(pendente);
    pendente = setTimeout(recarregarVista, 60);
  }

  let iniciado = false;

  async function iniciar() {
    if (iniciado) return;
    raiz = document.getElementById("app");
    if (!raiz) return;
    iniciado = true;
    aplicarTema(temaSalvo());
    montarCasca();
    window.addEventListener("hashchange", navegar);

    db.assinar(aoMudarDados);
    await db.iniciar();

    if (db.motor === "supabase" && !db.usuario) mostrarPortao();
    navegar();

    if (db.motor === "local") {
      setTimeout(() => U.aviso("Modo local: dados de exemplo da planilha, salvos só neste navegador.", "info", "raio"), 900);
    }
  }

  return { iniciar, recarregarVista, navegar, ROTAS };
})();

document.addEventListener("DOMContentLoaded", () => CI.app.iniciar());
if (document.readyState !== "loading") CI.app.iniciar();

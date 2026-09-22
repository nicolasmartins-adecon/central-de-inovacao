/* =============================================================================
   DADOS DE EXEMPLO — transcritos da planilha "Central de Inovação".
   Usados apenas no modo local. Com Supabase conectado, quem manda é o banco.
   ========================================================================== */

window.CI_SEED = (function () {
  const D = {
    pres:  "dir-presidencia",
    jf:    "dir-juridico-financeiro",
    gp:    "dir-gestao-pessoas",
    com:   "dir-comercial",
    mkt:   "dir-marketing",
    proj:  "dir-projetos",
    top:   "dir-top-of-mind",
    conex: "dir-conexao"
  };

  const diretorias = [
    { id: D.pres, nome: "Presidência", sigla: "PRES", composicao: "Presidente e Vice-Presidente",
      pergunta_norteadora: "Como melhorar os processos para garantir a continuidade da empresa, qualidade e consistência da gestão interna da Adecon?",
      cor: "#14161A", ordem: 1, conta_no_total: false },
    { id: D.jf, nome: "Jurídico-Financeiro", sigla: "JF", composicao: "Diretor, Gerente e Assessores",
      pergunta_norteadora: "Como melhorar os processos para garantir a parte administrativa, jurídica e financeira da Adecon?",
      cor: "#0FA34F", ordem: 2 },
    { id: D.gp, nome: "Gestão de Pessoas", sigla: "GP", composicao: "Diretor, Gerente e Assessores",
      pergunta_norteadora: "Como melhorar os processos para garantir o desenvolvimento dos membros, capacitações e análises de clima na Adecon?",
      cor: "#F2C200", ordem: 3 },
    { id: D.com, nome: "Comercial", sigla: "COM", composicao: "Diretor, Gerente e Assessores",
      pergunta_norteadora: "Como melhorar os processos da inteligência de mercado, da prospecção e do processo de vendas?",
      cor: "#F5871F", ordem: 4 },
    { id: D.mkt, nome: "Marketing", sigla: "MKT", composicao: "Diretor, Gerente e Assessores",
      pergunta_norteadora: "Como melhorar os processos para garantir a chegada de clientes à Adecon?",
      cor: "#B79CF0", ordem: 5 },
    { id: D.proj, nome: "Projetos", sigla: "PROJ", composicao: "Diretor, Gerente e Assessores",
      pergunta_norteadora: "Como melhorar os processos referentes aos projetos internos e externos da Adecon?",
      cor: "#2563EB", ordem: 6 },
    { id: D.top, nome: "TOP of Mind", sigla: "TOP", composicao: "Diretor, Coordenadores e Assessores",
      pergunta_norteadora: "Como melhorar os processos para garantir que o projeto aconteça da melhor forma?",
      cor: "#5B21B6", ordem: 7 },
    { id: D.conex, nome: "Diretorias em Conexão", sigla: "CONEX", composicao: "Todas as diretorias",
      pergunta_norteadora: "Como conectar as diretorias em torno de projetos que atravessam a empresa inteira?",
      cor: "#06B6D4", ordem: 8, conta_no_total: false }
  ];

  const projetos = [
    {
      id: "proj-hackadecon", codigo: "1.0", nome: "HACKADECON", diretoria_id: D.conex,
      tipo: "Projeto Interno", prioridade: "Alta", status: "Planejado",
      objetivo: "Garantir que a Adecon está preparando os membros para o mercado de trabalho, acompanhando as demandas atuais.",
      equipe: "Diretores, Coordenadores, Gerentes e Assessores (do 1º PSel)",
      professor_apoiador: "", responsavel: "Gerente de Inovação",
      metodologia: "SCRUM (reuniões diárias e semanais) e Inteligência Artificial",
      inicio: "2027-04-14", termino: "2027-07-30", cor: "",
      // a planilha diz "DIRETORIA: Todas" — entra no quadro de todas, contando uma vez
      diretorias_apoio: [D.pres, D.jf, D.gp, D.com, D.mkt, D.proj, D.top]
    },
    {
      id: "proj-inner", codigo: "2.0", nome: "INNER of Mind", diretoria_id: D.top,
      tipo: "Projeto Interno", prioridade: "Alta", status: "Planejado",
      objetivo: "Garantir a gestão do conhecimento da maioria dos processos (cargos ou demandas), para consolidar a diretoria e trazer mais transparência à empresa e às gestões futuras.",
      equipe: "Diretor, Coordenadores e Assessores",
      professor_apoiador: "", responsavel: "Diretoria do TOP",
      metodologia: "PDCA (reuniões semanais) e Gestão do Conhecimento",
      inicio: "2027-01-15", termino: "2027-03-24", cor: ""
    },
    {
      id: "proj-capacitacoes", codigo: "3.0", nome: "Calendarização das capacitações", diretoria_id: D.gp,
      tipo: "Projeto Interno", prioridade: "Média", status: "Planejado",
      objetivo: "Garantir maior assertividade para a alocação de capacitações em cada diretoria.",
      equipe: "Gerente de Inovação e de DHO, assessores de P&D e de Gestão de Pessoas",
      professor_apoiador: "", responsavel: "Gerente de DHO",
      metodologia: "SCRUM (reuniões diárias e semanais) e Gestão do Conhecimento",
      inicio: "2027-01-15", termino: "2027-03-24", cor: "",
      diretorias_apoio: [D.pres]
    },
    {
      id: "proj-crm", codigo: "4.0", nome: "CRM Integrada", diretoria_id: D.conex,
      tipo: "Projeto Interno", prioridade: "Alta", status: "Planejado",
      objetivo: "Garantir que Comercial e Marketing estejam alinhadas, trazendo um resultado mais assertivo sobre os leads que chegam pelas duas frentes.",
      equipe: "Diretores, Gerentes e assessores de Marketing e Comercial",
      professor_apoiador: "", responsavel: "Diretoria Comercial",
      metodologia: "SCRUM (reuniões diárias e semanais) e Funil Y",
      inicio: "2027-01-15", termino: "2027-03-24", cor: "",
      diretorias_apoio: [D.com, D.mkt]
    },
    {
      id: "proj-melhoria", codigo: "5.0", nome: "Melhoria dos Processos", diretoria_id: D.jf,
      tipo: "Projeto Interno", prioridade: "Média", status: "Planejado",
      objetivo: "", equipe: "", professor_apoiador: "", responsavel: "",
      metodologia: "", inicio: "2027-02-01", termino: "2027-05-28", cor: ""
    },
    {
      id: "proj-bancodados", codigo: "6.0", nome: "Banco de dados (clientes)", diretoria_id: D.jf,
      tipo: "Projeto Interno", prioridade: "Baixa", status: "Planejado",
      objetivo: "", equipe: "", professor_apoiador: "", responsavel: "",
      metodologia: "", inicio: "2027-03-01", termino: "2027-06-30", cor: ""
    },
    {
      id: "proj-gestaoconstrucao", codigo: "7.0", nome: "Gestão e Construção", diretoria_id: D.jf,
      tipo: "Projeto Interno", prioridade: "Baixa", status: "Planejado",
      objetivo: "", equipe: "", professor_apoiador: "", responsavel: "",
      metodologia: "", inicio: "2027-05-03", termino: "2027-09-30", cor: ""
    },
    {
      id: "proj-modulos", codigo: "8.0", nome: "Inovação dos Módulos", diretoria_id: D.proj,
      tipo: "Projeto Interno", prioridade: "Alta", status: "Planejado",
      objetivo: "Garantir que os módulos estejam atualizados de acordo com as atuais demandas de mercado.",
      equipe: "Diretores, Gerentes e assessores de Projetos",
      professor_apoiador: "", responsavel: "Diretoria de Projetos",
      metodologia: "SCRUM (reuniões diárias e semanais)",
      inicio: "2027-01-15", termino: "2027-03-24", cor: ""
    },
    {
      id: "proj-imersao", codigo: "9.0", nome: "Imersão", diretoria_id: D.pres,
      tipo: "Projeto Interno", prioridade: "Média", status: "Planejado",
      objetivo: "Estruturar a imersão e tornar o desenvolvimento de lideranças mais assertivo.",
      equipe: "Presidência", professor_apoiador: "", responsavel: "Presidência",
      metodologia: "", inicio: "", termino: "", cor: ""
    },
    /* --- iniciativas e pontos de atenção da aba GERAL --- */
    { id: "proj-cnpj", nome: "Consulta por CNPJ", diretoria_id: D.com, tipo: "Iniciativa",
      prioridade: "Média", status: "Planejado", objetivo: "", equipe: "", responsavel: "",
      metodologia: "", inicio: "", termino: "", cor: "" },
    { id: "proj-adeconconstroi", nome: "Adecon constrói", diretoria_id: D.proj, tipo: "Iniciativa",
      prioridade: "Média", status: "Planejado", objetivo: "", equipe: "", responsavel: "",
      metodologia: "", inicio: "", termino: "", cor: "" },
    { id: "proj-stakeholders", nome: "Mapeamento dos Stakeholders", diretoria_id: D.conex, tipo: "Iniciativa",
      prioridade: "Média", status: "Planejado", objetivo: "", equipe: "", responsavel: "",
      metodologia: "", inicio: "", termino: "", cor: "",
      diretorias_apoio: [D.com, D.mkt, D.pres] },
    { id: "proj-funily", nome: "Funil Y", diretoria_id: D.mkt, tipo: "Iniciativa",
      prioridade: "Média", status: "Planejado", objetivo: "", equipe: "", responsavel: "",
      metodologia: "", inicio: "", termino: "", cor: "" },
    { id: "proj-manualcluster", nome: "Manual do cluster", diretoria_id: D.gp, tipo: "Ponto de Atenção",
      prioridade: "Média", status: "Planejado", objetivo: "", equipe: "", responsavel: "",
      metodologia: "", inicio: "", termino: "", cor: "" },
    { id: "proj-trafegopago", nome: "Coleta de dados (Tráfego Pago)", diretoria_id: D.mkt, tipo: "Ponto de Atenção",
      prioridade: "Média", status: "Planejado", objetivo: "", equipe: "", responsavel: "",
      metodologia: "", inicio: "", termino: "", cor: "" }
  ];

  /* HACKADECON — as 17 etapas da planilha, com as datas do cabeçalho (ciclo 2027) */
  const etapasHacka = [
    ["Reunião geral com todos os diretores para falar sobre o projeto", "Gerente de Inovação", "2027-04-14"],
    ["Repasse aos gerentes e assessores", "Gerente de Inovação", "2027-04-16"],
    ["Mapeamento dos processos que poderiam ser auxiliados pela inteligência artificial", "Assessores", "2027-04-28"],
    ["Análise dos processos que podem ser auxiliados", "Gerente de Inovação", "2027-05-05"],
    ["Reunião geral com todos os diretores para repassar os processos mapeados", "Gerente de Inovação", "2027-05-06"],
    ["Reunião com os assessores e gerentes para repassar os pontos validados", "Gerente de Inovação", "2027-05-10"],
    ["Estudo das inteligências artificiais que poderiam ser implementadas", "Assessores", "2027-05-31"],
    ["Relatório de como implementar as IAs em cada processo, com custo e prazo", "Assessores", "2027-05-31"],
    ["Análise dos relatórios produzidos pelos assessores", "Gerente de Inovação", "2027-06-05"],
    ["Repasse aos diretores", "Gerente de Inovação", "2027-06-06"],
    ["Teste prático de todos os processos validados", "Gerentes e Assessores", "2027-06-30"],
    ["Relatório de análise dos resultados", "Assessores", "2027-06-30"],
    ["Análise dos relatórios produzidos pelos assessores", "Gerente de Inovação", "2027-07-06"],
    ["Repasse final aos diretores", "Gerente de Inovação", "2027-07-08"],
    ["Estruturação e implementação dos processos no Onboarding (PAdecon)", "Assessores e Gerentes", "2027-07-16"],
    ["Relatório de todo o processo, indicando os principais pontos", "Gerente de Inovação", "2027-07-27"],
    ["Apresentação para a empresa", "Assessores", "2027-07-30"]
  ];

  const etapasInner = [
    ["Estudo dos processos referentes a cada cargo", "Diretoria do TOP", "2027-01-29"],
    ["Mapeamento dos processos previamente conhecidos", "Diretoria do TOP", "2027-02-19"],
    ["Apresentação do onboarding e dos processos (caso haja algum fora dele)", "Diretoria do TOP", "2027-03-12"]
  ];

  const etapas = [];
  etapasHacka.forEach(([descricao, responsavel, data], i) => {
    etapas.push({
      id: "etp-hacka-" + (i + 1), projeto_id: "proj-hackadecon",
      numero: i + 1, descricao, responsavel, responsavel_email: "",
      data_entrega: data, concluida: i < 2, concluida_em: i < 2 ? "2026-09-12T14:20:00Z" : null,
      observacao: i === 0 ? "Pauta aprovada pela diretoria executiva; ata anexada ao Drive." : "",
      anotacoes: "", arquivo_url: "", ordem: i
    });
  });
  etapasInner.forEach(([descricao, responsavel, data], i) => {
    etapas.push({
      id: "etp-inner-" + (i + 1), projeto_id: "proj-inner",
      numero: i + 1, descricao, responsavel, responsavel_email: "",
      data_entrega: data, concluida: false, concluida_em: null,
      observacao: "", anotacoes: "", arquivo_url: "", ordem: i
    });
  });

  const comentarios = [
    { id: "com-1", etapa_id: "etp-hacka-3", projeto_id: "proj-hackadecon",
      autor_nome: "Nícolas", autor_email: "",
      corpo: "Sugiro começar pelo Comercial: a prospecção tem o maior volume de tarefas repetitivas e o ganho aparece rápido.",
      criado_em: "2026-09-16T13:05:00Z" },
    { id: "com-2", etapa_id: "etp-hacka-3", projeto_id: "proj-hackadecon",
      autor_nome: "Gerência de Inovação", autor_email: "",
      corpo: "Combinado. Vou montar o formulário de mapeamento para os assessores preencherem até a reunião de repasse.",
      criado_em: "2026-09-17T09:40:00Z" }
  ];

  /* Quadro das diretorias (INICIATIVAS | PROJETOS INTERNOS | PONTOS DE ATENÇÃO | ...) */
  /* O quadro das diretorias é montado a partir dos projetos e das
     implementações acima. Esta tabela guarda só anotações livres. */
  const itens_diretoria = [];


  /* Base do indicador TIP — alimente conforme as ferramentas forem entrando */
  const implementacoes = [
    { id: "imp-1", tipo: "Ferramenta", nome: "Central de Inovação (este painel)", responsavel: "Gerência de Inovação",
      status: "Em teste", diretoria_id: D.conex, relatorio_url: "", data_implementacao: "",
      diretorias_apoio: [D.pres, D.jf, D.gp, D.com, D.mkt, D.proj, D.top] },
    { id: "imp-2", tipo: "Processo", nome: "Repasse semanal de projetos internos", responsavel: "Gerência de Inovação",
      status: "Proposto", diretoria_id: D.conex, relatorio_url: "", data_implementacao: "",
      diretorias_apoio: [D.pres, D.proj, D.top] }
  ];

  const avaliacoes = [];
  const inscricoes = [];

  return { diretorias, projetos, etapas, comentarios, itens_diretoria,
           implementacoes, avaliacoes, inscricoes };
})();

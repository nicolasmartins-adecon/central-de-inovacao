-- =============================================================================
-- CENTRAL DE INOVAÇÃO — ADECON
-- Schema completo do Supabase (PostgreSQL)
--
-- Como usar:
--   Supabase Dashboard -> SQL Editor -> New query -> cole este arquivo -> Run.
--   Pode ser executado mais de uma vez com segurança (tudo é IF NOT EXISTS /
--   CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_net";      -- chamadas HTTP a partir do banco
-- create extension if not exists "pg_cron";  -- habilite em Database -> Extensions

-- =============================================================================
-- 1. TIPOS
-- =============================================================================

do $$ begin
  create type tipo_acao as enum (
    'Projeto Interno', 'Iniciativa', 'Ponto de Atenção', 'Processo', 'Ferramenta'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type prioridade_nivel as enum ('Alta', 'Média', 'Baixa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_projeto as enum (
    'Planejado', 'Em andamento', 'Em risco', 'Concluído', 'Pausado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type coluna_diretoria as enum (
    'Iniciativas', 'Projetos Internos', 'Pontos de Atenção', 'Processos', 'Ferramentas'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_implementacao as enum (
    'Proposto', 'Em teste', 'Implementado', 'Descartado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type papel_membro as enum ('admin', 'gestor', 'membro');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- 2. TABELAS
-- =============================================================================

-- 2.1 Perfis (espelha auth.users) ---------------------------------------------
create table if not exists public.perfis (
  id              uuid primary key references auth.users(id) on delete cascade,
  nome            text not null default '',
  email           text not null,
  cargo           text,
  diretoria_id    uuid,
  papel           papel_membro not null default 'membro',
  receber_emails  boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- 2.2 Diretorias --------------------------------------------------------------
create table if not exists public.diretorias (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null unique,
  sigla                 text,
  composicao            text,                 -- "DIRETOR, GERENTE E ASSESSORES"
  pergunta_norteadora   text,
  cor                   text default '#4ED6C0',
  ordem                 int  not null default 0,
  criado_em             timestamptz not null default now()
);

-- Presidência e Diretorias em Conexão funcionam como diretorias em tudo, mas
-- não entram na CONTAGEM de "quantas diretorias temos". Este campo decide isso,
-- para a regra ficar no dado e não no código.
alter table public.diretorias
  add column if not exists conta_no_total boolean not null default true;

alter table public.perfis
  drop constraint if exists perfis_diretoria_fk;
alter table public.perfis
  add constraint perfis_diretoria_fk
  foreign key (diretoria_id) references public.diretorias(id) on delete set null;

-- 2.3 Projetos ----------------------------------------------------------------
create table if not exists public.projetos (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text,
  nome                text not null,
  diretoria_id        uuid references public.diretorias(id) on delete set null,
  tipo                tipo_acao not null default 'Projeto Interno',
  objetivo            text,
  equipe              text,
  professor_apoiador  text,
  metodologia         text,
  inicio              date,
  termino             date,
  prioridade          prioridade_nivel not null default 'Média',
  status              status_projeto  not null default 'Planejado',
  responsavel         text,
  responsavel_email   text,
  cor                 text default '#FF5A1F',
  criado_por          uuid references auth.users(id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index if not exists idx_projetos_diretoria on public.projetos(diretoria_id);

-- Uma ação pode ser tocada por várias diretorias. `diretoria_id` é a responsável
-- e `diretorias_apoio` guarda as demais. A ação continua sendo UMA linha, então
-- os indicadores nunca a contam duas vezes; ela só aparece no quadro de cada
-- diretoria envolvida.
alter table public.projetos
  add column if not exists diretorias_apoio uuid[] not null default '{}';
create index if not exists idx_projetos_apoio
  on public.projetos using gin (diretorias_apoio);
create index if not exists idx_projetos_status    on public.projetos(status);

-- 2.4 Etapas ------------------------------------------------------------------
create table if not exists public.etapas (
  id                 uuid primary key default gen_random_uuid(),
  projeto_id         uuid not null references public.projetos(id) on delete cascade,
  numero             numeric(6,1) not null default 1,
  descricao          text not null default '',
  responsavel        text,
  responsavel_email  text,
  data_entrega       date,
  concluida          boolean not null default false,
  concluida_em       timestamptz,
  observacao         text,          -- OBSERVAÇÃO DA EXECUÇÃO
  anotacoes          text,          -- ANOTAÇÕES DE REUNIÃO
  arquivo_url        text,          -- ARQUIVO
  ordem              int not null default 0,
  criado_por         uuid references auth.users(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index if not exists idx_etapas_projeto on public.etapas(projeto_id, ordem);
create index if not exists idx_etapas_prazo   on public.etapas(data_entrega) where concluida = false;

-- "DENTRO DO PRAZO" da planilha, calculado pelo banco.
-- true  = entregue até a data / ainda dentro do prazo
-- false = atrasada
create or replace function public.etapa_dentro_do_prazo(e public.etapas)
returns boolean language sql immutable as $$
  select case
    when e.data_entrega is null then true
    when e.concluida then coalesce(e.concluida_em::date <= e.data_entrega, true)
    else current_date <= e.data_entrega
  end;
$$;

-- 2.5 Comentários por etapa ---------------------------------------------------
create table if not exists public.comentarios (
  id           uuid primary key default gen_random_uuid(),
  etapa_id     uuid not null references public.etapas(id) on delete cascade,
  projeto_id   uuid references public.projetos(id) on delete cascade,
  autor_id     uuid references auth.users(id) on delete set null,
  autor_nome   text not null default 'Membro',
  autor_email  text,
  corpo        text not null,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_comentarios_etapa on public.comentarios(etapa_id, criado_em);

-- 2.6 Quadro das diretorias ---------------------------------------------------
-- (INICIATIVAS | PROJETOS INTERNOS | PONTOS DE ATENÇÃO | PROCESSOS | FERRAMENTAS)
create table if not exists public.itens_diretoria (
  id            uuid primary key default gen_random_uuid(),
  diretoria_id  uuid not null references public.diretorias(id) on delete cascade,
  coluna        coluna_diretoria not null,
  titulo        text not null,
  descricao     text,
  responsavel   text,
  projeto_id    uuid references public.projetos(id) on delete set null,
  ordem         int not null default 0,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_itens_diretoria on public.itens_diretoria(diretoria_id, coluna, ordem);

-- 2.7 Implementação de ferramentas e processos --------------------------------
create table if not exists public.implementacoes (
  id                  uuid primary key default gen_random_uuid(),
  tipo                text not null default 'Processo' check (tipo in ('Ferramenta','Processo')),
  nome                text not null,
  responsavel         text,
  relatorio_url       text,
  status              status_implementacao not null default 'Proposto',
  diretoria_id        uuid references public.diretorias(id) on delete set null,
  data_implementacao  date,
  criado_em           timestamptz not null default now()
);

alter table public.implementacoes
  add column if not exists diretorias_apoio uuid[] not null default '{}';
create index if not exists idx_implementacoes_apoio
  on public.implementacoes using gin (diretorias_apoio);

-- 2.8 Avaliações das diretorias (base do ISD) ---------------------------------
create table if not exists public.avaliacoes (
  id            uuid primary key default gen_random_uuid(),
  diretoria_id  uuid references public.diretorias(id) on delete cascade,
  nota          numeric(4,1) not null check (nota >= 0),
  nota_maxima   numeric(4,1) not null default 10,
  competencia   date not null default date_trunc('month', current_date)::date,
  comentario    text,
  criado_em     timestamptz not null default now()
);

-- 2.9 Inscrições de aviso ----------------------------------------------------
-- Cada membro cadastra o próprio e-mail e escolhe o que quer acompanhar.
-- projeto_id nulo = quer ser avisado de todos os projetos internos.
create table if not exists public.inscricoes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null default '',
  email       text not null,
  projeto_id  uuid references public.projetos(id) on delete cascade,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Um e-mail por projeto, e no máximo uma inscrição "todos" por e-mail.
-- (Índices parciais porque, em UNIQUE comum, dois NULL não colidem.)
create unique index if not exists uq_inscricao_projeto
  on public.inscricoes (lower(email), projeto_id) where projeto_id is not null;
create unique index if not exists uq_inscricao_geral
  on public.inscricoes (lower(email)) where projeto_id is null;
create index if not exists idx_inscricoes_projeto on public.inscricoes(projeto_id) where ativo;

-- 2.10 Fila de notificações por e-mail (consumida pela Edge Function) ----------
create table if not exists public.notificacoes (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null,               -- etapa_atribuida | comentario_novo | prazo_proximo | prazo_vencido | etapa_concluida
  para_email   text not null,
  assunto      text not null,
  dados        jsonb not null default '{}'::jsonb,
  status       text not null default 'pendente' check (status in ('pendente','enviada','erro')),
  erro         text,
  tentativas   int not null default 0,
  enviada_em   timestamptz,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_notificacoes_pendentes
  on public.notificacoes(criado_em) where status = 'pendente';

-- Evita reenviar o mesmo lembrete de prazo no mesmo dia
-- Um aviso por destinatário, por alvo, por dia: rodar a função duas vezes não
-- duplica e-mail.
create unique index if not exists uq_notificacoes_prazo_dia
  on public.notificacoes (
    tipo, para_email,
    (coalesce(dados->>'etapa_id', dados->>'projeto_id', '')),
    ((criado_em at time zone 'UTC')::date)
  )
  where tipo in ('prazo_proximo','prazo_vencido','prazo_projeto');

-- =============================================================================
-- 3. VIEWS
-- =============================================================================

-- 3.1 Progresso por projeto ---------------------------------------------------
create or replace view public.vw_projeto_progresso as
select
  p.id                                                          as projeto_id,
  p.nome,
  count(e.id)                                                   as total_etapas,
  count(e.id) filter (where e.concluida)                        as etapas_concluidas,
  count(e.id) filter (
    where not e.concluida and e.data_entrega < current_date
  )                                                             as etapas_atrasadas,
  case when count(e.id) = 0 then 0
       else round(100.0 * count(e.id) filter (where e.concluida) / count(e.id))
  end                                                           as progresso
from public.projetos p
left join public.etapas e on e.projeto_id = p.id
group by p.id, p.nome;

-- 3.2 Participação: uma linha por (ação, diretoria envolvida) --------------
-- Serve para listar o quadro de cada diretoria. Não use para contar: quem conta
-- é a tabela de origem, onde cada ação é uma linha só.
create or replace view public.vw_participacao as
  select p.id as acao_id, 'projeto'::text as origem, p.nome, p.tipo::text as categoria,
         d.id as diretoria_id, (d.id = p.diretoria_id) as responsavel
  from public.projetos p
  cross join lateral unnest(array[p.diretoria_id] || p.diretorias_apoio) as dir(id)
  join public.diretorias d on d.id = dir.id
union all
  select i.id, 'implementacao', i.nome, i.tipo,
         d.id, (d.id = i.diretoria_id)
  from public.implementacoes i
  cross join lateral unnest(array[i.diretoria_id] || i.diretorias_apoio) as dir(id)
  join public.diretorias d on d.id = dir.id;

-- 3.2 Indicadores (TIP, ISD, Inovação) ----------------------------------------
create or replace view public.vw_indicadores as
with tip as (
  select
    count(*) filter (where status = 'Implementado')::numeric as implementados,
    count(*)::numeric                                        as propostos
  from public.implementacoes
),
isd as (
  select
    coalesce(sum(nota), 0)::numeric        as soma_notas,
    coalesce(sum(nota_maxima), 0)::numeric as soma_maximas
  from public.avaliacoes
),
inov as (
  select
    count(*) filter (where status = 'Concluído' and tipo = 'Projeto Interno')::numeric as atingidos,
    count(*) filter (where tipo = 'Projeto Interno')::numeric                          as definidos
  from public.projetos
)
select
  tip.implementados,
  tip.propostos,
  case when tip.propostos = 0 then 0 else round(100 * tip.implementados / tip.propostos, 1) end as tip,
  isd.soma_notas,
  isd.soma_maximas,
  case when isd.soma_maximas = 0 then 0 else round(100 * isd.soma_notas / isd.soma_maximas, 1) end as isd,
  inov.atingidos,
  inov.definidos,
  case when inov.definidos = 0 then 0 else round(100 * inov.atingidos / inov.definidos, 1) end as inovacao
from tip, isd, inov;

-- =============================================================================
-- 4. TRIGGERS
-- =============================================================================

-- 4.1 atualizado_em -----------------------------------------------------------
create or replace function public.tg_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists touch_projetos on public.projetos;
create trigger touch_projetos before update on public.projetos
  for each row execute function public.tg_touch();

drop trigger if exists touch_etapas on public.etapas;
create trigger touch_etapas before update on public.etapas
  for each row execute function public.tg_touch();

-- 4.2 Marca a data de conclusão da etapa --------------------------------------
create or replace function public.tg_etapa_concluida()
returns trigger language plpgsql as $$
begin
  if new.concluida and not coalesce(old.concluida, false) then
    new.concluida_em := now();
  elsif not new.concluida then
    new.concluida_em := null;
  end if;
  return new;
end $$;

drop trigger if exists etapa_concluida on public.etapas;
create trigger etapa_concluida before update on public.etapas
  for each row execute function public.tg_etapa_concluida();

-- 4.3 Novo perfil ao criar usuário --------------------------------------------
create or replace function public.tg_novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_novo_usuario();

-- 4.4 Enfileira e-mail quando uma etapa é atribuída ---------------------------
create or replace function public.tg_notificar_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_projeto text;
begin
  if new.responsavel_email is null or new.responsavel_email = '' then
    return new;
  end if;

  -- só notifica quando o responsável muda (ou na criação)
  if tg_op = 'UPDATE'
     and coalesce(old.responsavel_email, '') = coalesce(new.responsavel_email, '')
     and coalesce(old.data_entrega, '1900-01-01') = coalesce(new.data_entrega, '1900-01-01') then
    return new;
  end if;

  select nome into v_projeto from public.projetos where id = new.projeto_id;

  insert into public.notificacoes (tipo, para_email, assunto, dados)
  values (
    'etapa_atribuida',
    new.responsavel_email,
    'Nova etapa sob sua responsabilidade — ' || coalesce(v_projeto, 'Projeto'),
    jsonb_build_object(
      'etapa_id',     new.id,
      'projeto_id',   new.projeto_id,
      'projeto',      v_projeto,
      'numero',       new.numero,
      'descricao',    new.descricao,
      'responsavel',  new.responsavel,
      'data_entrega', new.data_entrega
    )
  );
  return new;
end $$;

drop trigger if exists notificar_etapa on public.etapas;
create trigger notificar_etapa after insert or update on public.etapas
  for each row execute function public.tg_notificar_etapa();

-- 4.5 Enfileira e-mail quando alguém comenta ----------------------------------
create or replace function public.tg_notificar_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_etapa   public.etapas%rowtype;
  v_projeto text;
  v_dest    text;
begin
  select * into v_etapa from public.etapas where id = new.etapa_id;
  if not found then return new; end if;

  select nome into v_projeto from public.projetos where id = v_etapa.projeto_id;

  -- avisa o responsável pela etapa, desde que não seja o próprio autor
  v_dest := v_etapa.responsavel_email;
  if v_dest is null or v_dest = '' or v_dest = coalesce(new.autor_email, '') then
    return new;
  end if;

  insert into public.notificacoes (tipo, para_email, assunto, dados)
  values (
    'comentario_novo',
    v_dest,
    new.autor_nome || ' comentou na etapa ' || v_etapa.numero || ' — ' || coalesce(v_projeto, 'Projeto'),
    jsonb_build_object(
      'etapa_id',   v_etapa.id,
      'projeto_id', v_etapa.projeto_id,
      'projeto',    v_projeto,
      'numero',     v_etapa.numero,
      'descricao',  v_etapa.descricao,
      'autor',      new.autor_nome,
      'corpo',      new.corpo
    )
  );
  return new;
end $$;

drop trigger if exists notificar_comentario on public.comentarios;
create trigger notificar_comentario after insert on public.comentarios
  for each row execute function public.tg_notificar_comentario();

-- =============================================================================
-- 5. ROW LEVEL SECURITY
--    Modelo: todo membro autenticado lê tudo e edita o conteúdo operacional.
--    Apagar projetos e diretorias exige papel 'admin' ou 'gestor'.
-- =============================================================================

create or replace function public.e_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel in ('admin','gestor')
  );
$$;

alter table public.perfis           enable row level security;
alter table public.diretorias       enable row level security;
alter table public.projetos         enable row level security;
alter table public.etapas           enable row level security;
alter table public.comentarios      enable row level security;
alter table public.itens_diretoria  enable row level security;
alter table public.implementacoes   enable row level security;
alter table public.avaliacoes       enable row level security;
alter table public.inscricoes       enable row level security;
alter table public.notificacoes     enable row level security;

-- perfis ----------------------------------------------------------------------
drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis
  for select to authenticated using (true);

drop policy if exists perfis_proprio on public.perfis;
create policy perfis_proprio on public.perfis
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- leitura geral para quem está autenticado ------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'diretorias','projetos','etapas','comentarios',
    'itens_diretoria','implementacoes','avaliacoes','inscricoes'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_leitura', t
    );
  end loop;
end $$;

-- escrita operacional para qualquer membro ------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'projetos','etapas','comentarios','itens_diretoria','implementacoes',
    'avaliacoes','inscricoes'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_insercao', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true)',
      t || '_insercao', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_edicao', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true)',
      t || '_edicao', t
    );
  end loop;
end $$;

-- exclusão --------------------------------------------------------------------
drop policy if exists etapas_exclusao on public.etapas;
create policy etapas_exclusao on public.etapas
  for delete to authenticated using (true);

drop policy if exists itens_exclusao on public.itens_diretoria;
create policy itens_exclusao on public.itens_diretoria
  for delete to authenticated using (true);

drop policy if exists implementacoes_exclusao on public.implementacoes;
create policy implementacoes_exclusao on public.implementacoes
  for delete to authenticated using (true);

drop policy if exists avaliacoes_exclusao on public.avaliacoes;
create policy avaliacoes_exclusao on public.avaliacoes
  for delete to authenticated using (true);

drop policy if exists inscricoes_exclusao on public.inscricoes;
create policy inscricoes_exclusao on public.inscricoes
  for delete to authenticated using (true);

-- o autor apaga o próprio comentário; gestor apaga qualquer um
drop policy if exists comentarios_exclusao on public.comentarios;
create policy comentarios_exclusao on public.comentarios
  for delete to authenticated using (autor_id = auth.uid() or public.e_gestor());

-- projetos e diretorias: só gestão apaga
drop policy if exists projetos_exclusao on public.projetos;
create policy projetos_exclusao on public.projetos
  for delete to authenticated using (public.e_gestor());

drop policy if exists diretorias_escrita on public.diretorias;
create policy diretorias_escrita on public.diretorias
  for all to authenticated using (public.e_gestor()) with check (public.e_gestor());

-- notificações: a fila é lida apenas pela service_role (Edge Function).
-- Nenhuma policy para 'authenticated' = ninguém no navegador lê a fila.

-- =============================================================================
-- 6. REALTIME
-- =============================================================================

do $$
begin
  alter publication supabase_realtime add table public.projetos;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.etapas;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.comentarios;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.itens_diretoria;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.implementacoes;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.inscricoes;
exception when duplicate_object then null; end $$;

-- =============================================================================
-- 7. AGENDAMENTOS (opcional — requer pg_cron + pg_net habilitados)
--
--    Troque SEU-PROJETO pelo ref do projeto e SUA-SERVICE-ROLE-KEY pela chave
--    service_role (Settings -> API). Rode este bloco DEPOIS de publicar as
--    Edge Functions.
-- =============================================================================

-- Remova os "--" das linhas abaixo depois de publicar as Edge Functions.
--
-- select cron.schedule(
--   'drenar-fila-emails',
--   '*/2 * * * *',                     -- a cada 2 minutos
--   $cron$
--   select net.http_post(
--     url     := 'https://SEU-PROJETO.supabase.co/functions/v1/enviar-notificacoes',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer SUA-SERVICE-ROLE-KEY"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $cron$
-- );
--
-- O Brasil não tem mais horário de verão, então Brasília é UTC-3 o ano todo:
-- 13h30 daqui = 16h30 UTC, todos os dias.
-- select cron.schedule(
--   'lembretes-de-prazo',
--   '30 16 * * *',                     -- 13h30 de Brasília
--   $cron$
--   select net.http_post(
--     url     := 'https://SEU-PROJETO.supabase.co/functions/v1/lembretes-prazos',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer SUA-SERVICE-ROLE-KEY"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $cron$
-- );

-- =============================================================================
-- 8. DADOS INICIAIS — as diretorias da planilha
-- =============================================================================

insert into public.diretorias (nome, sigla, composicao, pergunta_norteadora, cor, ordem) values
  ('Presidência', 'PRES', 'Presidente e Vice-Presidente',
   'Como melhorar os processos para garantir a continuidade da empresa, qualidade e consistência da gestão interna da Adecon?',
   '#14161A', 1),
  ('Jurídico-Financeiro', 'JF', 'Diretor, Gerente e Assessores',
   'Como melhorar os processos para garantir a parte administrativa, jurídica e financeira da Adecon?',
   '#0FA34F', 2),
  ('Gestão de Pessoas', 'GP', 'Diretor, Gerente e Assessores',
   'Como melhorar os processos para garantir o desenvolvimento dos membros, capacitações e análises de clima na Adecon?',
   '#F2C200', 3),
  ('Comercial', 'COM', 'Diretor, Gerente e Assessores',
   'Como melhorar os processos da inteligência de mercado, da prospecção e do processo de vendas?',
   '#F5871F', 4),
  ('Marketing', 'MKT', 'Diretor, Gerente e Assessores',
   'Como melhorar os processos para garantir a chegada de clientes à Adecon?',
   '#B79CF0', 5),
  ('Projetos', 'PROJ', 'Diretor, Gerente e Assessores',
   'Como melhorar os processos referentes aos projetos internos e externos da Adecon?',
   '#2563EB', 6),
  ('TOP of Mind', 'TOP', 'Diretor, Coordenadores e Assessores',
   'Como melhorar os processos para garantir que o projeto aconteça da melhor forma?',
   '#5B21B6', 7),
  ('Diretorias em Conexão', 'CONEX', 'Todas as diretorias',
   'Como conectar as diretorias em torno de projetos que atravessam a empresa inteira?',
   '#06B6D4', 8)
on conflict (nome) do update set
  cor = excluded.cor,
  sigla = excluded.sigla,
  ordem = excluded.ordem;

update public.diretorias set conta_no_total = false
  where nome in ('Presidência', 'Diretorias em Conexão');

-- =============================================================================
-- Fim. Próximo passo: publicar as Edge Functions (pasta supabase/functions).
-- =============================================================================

-- =============================================================================
-- CENTRAL DE INOVAÇÃO — ADECON
-- ATUALIZAÇÕES depois do schema.sql
--
-- Este arquivo reúne tudo o que foi acrescentado ao banco depois da carga
-- inicial: o Brainstorm (ideias e problemas), a privacidade dos registros e o
-- veredito automático de prazo.
--
-- Como usar:
--   Supabase Dashboard -> SQL Editor -> New query -> cole este arquivo -> Run.
--
-- É seguro rodar mais de uma vez, e é seguro rodar mesmo que você já tenha
-- rodado os antigos `brainstorm.sql` e `prazos.sql`: tudo aqui só acrescenta
-- ou substitui definições, nunca apaga dado.
--
-- Resultado esperado: "Success. No rows returned".
-- =============================================================================


-- =============================================================================
-- 1. BRAINSTORM — ideias e problemas
-- =============================================================================
-- Qualquer membro publica uma ideia OU traz um problema; `natureza` separa os
-- dois. O funil (atração -> qualificação -> fechamento) organiza, e os dois
-- saem do outro lado como projeto interno. `apoios` guarda os e-mails de quem
-- apoiou, então a contagem já é de pessoas distintas, sem tabela de votos.

create table if not exists public.ideias (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  descricao    text,
  natureza     text not null default 'ideia',
  tipo         text not null default 'Iniciativa',
  autor        text,
  email        text,
  diretoria_id uuid references public.diretorias(id) on delete set null,
  etapa        text not null default 'atracao',
  ordem        integer not null default 0,
  apoios       text[] not null default '{}',
  arquivada    boolean not null default false,
  privada      boolean not null default false,
  criado_em    timestamptz not null default now()
);

-- Quem criou a tabela antes destas colunas as ganha aqui.
alter table public.ideias add column if not exists natureza text not null default 'ideia';
alter table public.ideias add column if not exists privada  boolean not null default false;

do $$
begin
  alter table public.ideias
    add constraint ideias_etapa_valida
    check (etapa in ('atracao','qualificacao','fechamento'));
exception when duplicate_object then null; end $$;

do $$
begin
  alter table public.ideias
    add constraint ideias_natureza_valida
    check (natureza in ('ideia','problema'));
exception when duplicate_object then null; end $$;

create index if not exists idx_ideias_etapa on public.ideias(etapa, ordem) where not arquivada;
create index if not exists idx_ideias_novas on public.ideias(criado_em desc) where not arquivada;


-- -----------------------------------------------------------------------------
-- 1.1 Privacidade: todo problema nasce privado
-- -----------------------------------------------------------------------------
-- Quem traz um incômodo não deveria ter que expô-lo para a empresa inteira
-- para que ele seja tratado. Registro privado não aparece no mural: só dentro
-- do funil. O gatilho garante isso no banco, mesmo que a tela falhe.

update public.ideias set privada = true where natureza = 'problema' and privada = false;

create or replace function public.ideias_problema_e_privado()
returns trigger language plpgsql as $$
begin
  if new.natureza = 'problema' then new.privada := true; end if;
  return new;
end $$;

drop trigger if exists trg_ideias_problema_e_privado on public.ideias;
create trigger trg_ideias_problema_e_privado
  before insert or update on public.ideias
  for each row execute function public.ideias_problema_e_privado();


-- -----------------------------------------------------------------------------
-- 1.2 Permissões
-- -----------------------------------------------------------------------------
-- Todo mundo que entrou no painel lê, publica e apoia.
--
-- IMPORTANTE, sem rodeio: a senha do funil ("5296") e o campo `privada` são
-- uma CORTINA NA TELA, não uma permissão de banco. Eles escondem o conteúdo de
-- quem só usa o site, mas quem souber usar a API consegue ler tudo com a chave
-- publicável. Para privacidade de verdade, a política de leitura abaixo teria
-- que filtrar por quem é o leitor — o que exige identificar cada pessoa, e não
-- uma senha compartilhada.

alter table public.ideias enable row level security;

drop policy if exists ideias_leitura on public.ideias;
create policy ideias_leitura on public.ideias
  for select to authenticated using (true);

drop policy if exists ideias_insercao on public.ideias;
create policy ideias_insercao on public.ideias
  for insert to authenticated with check (true);

drop policy if exists ideias_edicao on public.ideias;
create policy ideias_edicao on public.ideias
  for update to authenticated using (true) with check (true);

-- Uma ideia publicada aparece na tela de todo mundo sem recarregar a página.
do $$
begin
  alter publication supabase_realtime add table public.ideias;
exception when duplicate_object then null; end $$;


-- =============================================================================
-- 2. VEREDITO AUTOMÁTICO DE PRAZO
-- =============================================================================
-- "Entregou no prazo?" deixa de depender de alguém olhar a data e julgar: o
-- banco responde sempre do mesmo jeito.

-- -----------------------------------------------------------------------------
-- 2.1 Memória do prazo original
-- -----------------------------------------------------------------------------
-- Quando a data de entrega é adiada DEPOIS de já ter vencido, a data antiga
-- fica guardada aqui e continua valendo no veredito. Repactuar serve para
-- reorganizar o trabalho, não para apagar que a entrega não saiu.

alter table public.etapas add column if not exists prazo_original date;
alter table public.etapas add column if not exists repactuada_em  timestamptz;

create or replace function public.etapas_guardar_prazo_furado()
returns trigger language plpgsql as $$
begin
  if new.data_entrega is distinct from old.data_entrega
     and old.data_entrega is not null
     and old.prazo_original is null
     and not old.concluida
     and old.data_entrega < (now() at time zone 'America/Sao_Paulo')::date
  then
    new.prazo_original := old.data_entrega;
    new.repactuada_em  := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_etapas_prazo_furado on public.etapas;
create trigger trg_etapas_prazo_furado
  before update on public.etapas
  for each row execute function public.etapas_guardar_prazo_furado();


-- -----------------------------------------------------------------------------
-- 2.2 O veredito
-- -----------------------------------------------------------------------------
-- Quatro respostas possíveis, todas calculadas:
--   no-prazo       entregue até a data combinada
--   fora-do-prazo  entregue, mas depois da data
--   nao-entregue   a data passou e a etapa continua aberta
--   sem-prazo      nunca houve data combinada; não entra em nenhuma conta
--
-- O `at time zone` não é detalhe: `concluida_em` é um instante guardado em UTC
-- e `data_entrega` é uma data do calendário. Sem converter para o fuso de quem
-- trabalha, uma etapa concluída às 21h de Brasília no próprio dia do prazo
-- apareceria como entregue fora do prazo, porque em UTC já é o dia seguinte.

create or replace function public.etapa_veredito(e public.etapas)
returns text language sql stable as $$
  select case
    when coalesce(e.prazo_original, e.data_entrega) is null then 'sem-prazo'
    when e.concluida and e.concluida_em is null then 'no-prazo'
    when e.concluida then
      case when (e.concluida_em at time zone 'America/Sao_Paulo')::date
                <= coalesce(e.prazo_original, e.data_entrega)
           then 'no-prazo' else 'fora-do-prazo' end
    when (now() at time zone 'America/Sao_Paulo')::date
         > coalesce(e.prazo_original, e.data_entrega) then 'nao-entregue'
    else 'em-dia'
  end;
$$;

-- A função antiga continua existindo para quem já a usava.
create or replace function public.etapa_dentro_do_prazo(e public.etapas)
returns boolean language sql stable as $$
  select public.etapa_veredito(e) in ('no-prazo', 'em-dia', 'sem-prazo');
$$;


-- -----------------------------------------------------------------------------
-- 2.3 Placar por diretoria
-- -----------------------------------------------------------------------------
-- Quantas etapas com prazo cada diretoria já teve julgadas, quantas cumpriu e
-- quantas estão em aberto com a data vencida. Serve para conferir o que a tela
-- de Indicadores mostra. Etapa ainda dentro do prazo não entra: não é acerto
-- nem erro.

create or replace view public.placar_prazo_diretoria as
  select
    d.id   as diretoria_id,
    d.nome as diretoria,
    count(*) filter (where public.etapa_veredito(e)
                           in ('no-prazo','fora-do-prazo','nao-entregue')) as julgadas,
    count(*) filter (where public.etapa_veredito(e) = 'no-prazo')       as no_prazo,
    count(*) filter (where public.etapa_veredito(e) = 'fora-do-prazo')  as fora_do_prazo,
    count(*) filter (where public.etapa_veredito(e) = 'nao-entregue')   as nao_entregues
  from public.etapas e
  join public.projetos  p on p.id = e.projeto_id
  join public.diretorias d on d.id = p.diretoria_id
  group by d.id, d.nome
  order by d.nome;


-- =============================================================================
-- 3. CONFERÊNCIA
-- =============================================================================
-- Rode isto depois, numa query nova. Devem voltar 3 linhas:
--   etapas / prazo_original, etapas / repactuada_em, ideias / privada
--
--   select table_name, column_name
--   from information_schema.columns
--   where table_schema = 'public'
--     and ((table_name = 'ideias' and column_name = 'privada')
--       or (table_name = 'etapas' and column_name in ('prazo_original','repactuada_em')))
--   order by table_name, column_name;
--
-- E o placar, para ver o veredito funcionando:
--
--   select * from public.placar_prazo_diretoria;
-- =============================================================================

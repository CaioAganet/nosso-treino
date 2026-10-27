# Configuração do Supabase — etapa do banco

Projeto: `nosso-treino` (`iyhzronkngzvnaduixxr`).
URL base: `https://iyhzronkngzvnaduixxr.supabase.co`.

## Estado atual

A migração foi preparada e testada em PostgreSQL local (PGlite). Ainda não foi executada no projeto online. O frontend continua usando armazenamento local; nenhuma sincronização é anunciada ou realizada nesta etapa.

## Executar no painel

1. Abra https://supabase.com/dashboard/project/iyhzronkngzvnaduixxr/sql/new.
2. Abra `supabase/migrations/202610270001_initial.sql` neste repositório, copie o conteúdo inteiro e cole em uma consulta nova do SQL Editor.
3. Clique em Run. O resultado esperado é Success. No rows returned.
4. Execute a consulta de verificação abaixo. Ela deve retornar as seis tabelas com `rls_enabled = true`, 18 exercícios, 3 fichas e 18 relacionamentos.

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
('nt_profiles','nt_exercises','nt_workouts','nt_workout_exercises','nt_sessions','nt_sets')
order by c.relname;
select (select count(*) from public.nt_exercises) as exercises,
       (select count(*) from public.nt_workouts) as workouts,
       (select count(*) from public.nt_workout_exercises) as workout_exercises;
```

A migração é transacional e deve ser executada uma única vez. Caso falhe, a transação inteira é revertida. Caso já existam tabelas nt_*, investigue antes de repetir. Não apagar tabelas para resolver erros.

## Estrutura e permissões

- `nt_profiles`: vínculo com Supabase Auth, nome do perfil e revisão de sincronização.
- `nt_exercises`, `nt_workouts`, `nt_workout_exercises`: catálogo dos 18 exercícios e três fichas oficiais.
- `nt_sessions`: sessão por usuário, identificador estável, data, encerramento e exclusão lógica.
- `nt_sets`: carga, repetições/tempo e conclusão por série.
- RLS ativa em todas as tabelas. Usuários autenticados consultam apenas seus próprios registros; catálogo permite leitura pública. Escritas diretas do frontend estão bloqueadas.
- As funções `nt_open_account`, `nt_read_state` e `nt_write_state` usam o usuário de `auth.uid()`, nunca um ID escolhido pelo cliente. Sem sessão autenticada não há leitura ou gravação privada.
- O estado é decomposto em sessões e séries em uma única transação. Alterações feitas por outro aparelho causam `SYNC_CONFLICT`, evitando sobrescrita silenciosa. Exclusão lógica permite restaurar o registro original.
- Cada conta representa um perfil. Compartilhar dados entre parceiros exigirá uma autorização e políticas próprias; alternar rótulos não concede acesso a outra conta.

## Testes

`npm ci` e `npm test` executam a suíte, incluindo testes PostgreSQL reais em memória: migração, RLS entre dois usuários, recusa de escrita direta, perfil inválido, repetições fracionárias, revisão obsoleta e exclusão lógica.

## Próxima etapa

Após confirmar a execução no painel: conectar Supabase Auth, implementar a fila de sincronização com cache separado por usuário e confirmação do servidor, e oferecer importação explícita dos dados locais do perfil correto. A chave pública já foi fornecida pelo usuário; nenhuma chave secreta é necessária no frontend. Nunca copiar service_role, senha do banco ou chave secret para o código.

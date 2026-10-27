# Supabase — Nosso Treino

Projeto: `iyhzronkngzvnaduixxr` · https://iyhzronkngzvnaduixxr.supabase.co.

## Estado

A migração inicial `migrations/202610270001_initial.sql` foi executada pelo usuário com sucesso no projeto online. A API pública retornou os 18 exercícios e 3 fichas; `nt_read_state` foi recusada com 401/42501 sem autenticação. Não executar a migração inicial novamente.

Frontend integrado ao SDK oficial supabase-js com e-mail/senha, confirmação de cadastro, login/logout e fila por usuário. Só usa a chave pública de supabase-config.js. Falta o teste real de cadastro/login/gravação com as contas dos usuários.

## Antes de cadastrar as contas

Em Authentication → URL Configuration, configurar:

- Site URL: endereço real onde o aplicativo estiver publicado (previsto: https://caioaganet.github.io/nosso-treino/; confirmar publicação no GitHub Pages antes).
- Redirect URLs: o mesmo endereço publicado e http://127.0.0.1:4173/nosso-treino/ para testes locais.

Em Authentication → Sign In / Providers → Email, manter confirmação de e-mail habilitada. Os rótulos podem variar no painel. Não desligar confirmação como atalho para erros de e-mail.

Para testar antes da publicação, usar temporariamente http://127.0.0.1:4173/nosso-treino/ como Site URL e deixar o servidor local rodando ao confirmar o e-mail. Links de cadastro por arquivo local usam a Site URL configurada no painel.

## Teste manual

1. Abrir o aplicativo e Conta e sincronização. Selecionar o próprio perfil, informar e-mail e senha e clicar em Criar conta.
2. Confirmar o e-mail no link recebido. Voltar ao aplicativo e Entrar.
3. Registrar uma série. Aguardar o status Sincronizado · confirmado pelo servidor.
4. Recarregar, entrar novamente se necessário e conferir a série no histórico.
5. Usar Importar meus treinos locais somente se quiser enviar os registros do perfil atual. Nenhuma importação é automática.
6. Repetir com a outra pessoa e confirmar que os registros permanecem separados.

Não fornecer senhas ao assistente; elas são digitadas apenas na interface de autenticação.

## Estrutura e segurança

- nt_profiles: vínculo com auth.users, perfil e revisão de sincronização.
- nt_exercises / nt_workouts / nt_workout_exercises: catálogo oficial público de leitura.
- nt_sessions / nt_sets: sessões e séries privadas, associadas ao usuário autenticado.
- RLS em todas as tabelas. Cada conta só lê seus próprios dados. Não há escrita direta pelo cliente.
- nt_open_account / nt_read_state / nt_write_state usam auth.uid(), sem aceitar IDs arbitrários de proprietários. Escrita de snapshot é decomposta em tabelas na mesma transação; revisão obsoleta causa SYNC_CONFLICT. Exclusões são lógicas.
- O frontend também fixa o token de autorização ao usuário da fila no momento da requisição, evitando envio de uma fila antiga com a sessão de outra conta.
- Filas pendentes permanecem separadas por UID no navegador. Ao resolver um conflito com a versão do servidor, uma cópia adicional de recuperação é guardada em nosso-treino:cloud:<UID>:recovery:<timestamp>. Exportar backup pela interface antes de resolver é o caminho mais simples para manter um arquivo acessível.
- O cliente não tenta sobrescrever automaticamente estados modificados em outro aparelho. Para atualizar uma conta sem pendências, use Carregar versão do servidor.

## Verificar catálogo e RLS no SQL Editor

```sql
select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
('nt_profiles','nt_exercises','nt_workouts','nt_workout_exercises','nt_sessions','nt_sets')
order by c.relname;
select (select count(*) from public.nt_exercises) as exercises,
       (select count(*) from public.nt_workouts) as workouts,
       (select count(*) from public.nt_workout_exercises) as workout_exercises;
```

`npm ci` e `npm test` executam também os testes PostgreSQL em memória. Não solicitam acesso de administrador nem criam usuários reais no Supabase.

# Nosso Treino

Aplicativo mobile-first de treinos A/B/C para Caio e Nicolli, em HTML, CSS e JavaScript. Interface em português, tema escuro, fichas oficiais com 18 exercícios e duas séries por exercício.

## Executar

Use Node.js 22 ou superior. Execute `npm ci`, `npm run build` e `npm run dev`. Abra http://127.0.0.1:4173/nosso-treino/. Os bundles são versionados para publicação estática no GitHub Pages e também permitem abrir index.html diretamente. Prefira HTTP/HTTPS para autenticação e uma origem de armazenamento consistente. Após editar fontes, execute novamente `npm run build`.

## Testes

`npm test` verifica os fluxos locais, edição/cancelamento, restauração de exclusões, importação, troca de conta, fila de sincronização, conflitos entre aparelhos, falhas de rede e armazenamento. PGlite executa a migração em PostgreSQL real em memória e verifica RLS entre dois usuários. Nenhuma conta de produção ou treino real é criado pelos testes.

## Registros e contas

- Sem login: dados dos dois perfis no navegador, com alternância rápida. São registros compartilhados neste dispositivo, sem barreira de autenticação.
- Menu **Conta e sincronização**: criar conta por e-mail/senha, entrar, sair, tentar sincronizar e consultar o estado do envio.
- Cada conta online representa Caio ou Nicolli. O nome é fixado na primeira abertura; contas existentes usam o perfil já registrado no banco. Para trocar para o parceiro, sair e entrar com a outra conta. Não há autorização para consultar dados privados do parceiro.
- A confirmação de e-mail deve estar habilitada no Supabase. Cada pessoa usa seu próprio e-mail. Senhas são enviadas diretamente ao Supabase pelo SDK oficial e não são gravadas pelo aplicativo.
- Dados locais são preservados durante login/logout. Para levá-los à conta, usar **Importar meus treinos locais** e confirmar o perfil. A importação preserva registros com a mesma identificação.
- Backups incluem os dois perfis no modo local e apenas a conta atual no modo online. Importar arquivo com perfis misturados em uma conta é recusado. Dados de outro domínio, porta ou HTML local não aparecem automaticamente na origem publicada.

## Sincronização

As alterações online entram imediatamente numa fila durável do navegador, separada por usuário. O envio ocorre após uma breve pausa. A interface só mostra **Sincronizado · confirmado pelo servidor** após confirmação real da gravação. Fechar a página pode deixar envios pendentes; ao entrar novamente, o aplicativo consulta o servidor e tenta retomar a fila.

O servidor usa revisão otimista: se outro aparelho alterou a conta, o envio é interrompido com conflito. Nada é sobrescrito automaticamente. Exporte seu estado atual em Histórico, depois use **Carregar versão do servidor** para adotar a versão online. A operação também deixa uma cópia de recuperação no armazenamento local. A integração não faz mesclagem automática de conflitos nem atualização em tempo real; use Sincronizar agora para enviar pendências e Carregar versão do servidor para buscar alterações de outro aparelho.

A mesma conta só pode manter uma aba com registros online aberta por navegador (Web Locks). Use Chrome/Safari/Firefox atualizados. O modo local continua disponível se a conexão não puder ser aberta. Ao reabrir sem internet, a conta pode exigir reconexão antes de exibir o cache online; o aplicativo não é um PWA offline completo.

## Funcionalidades

- Dashboard com agenda, resumo semanal de treinos completos/parciais e último treino.
- Carga e repetições/tempo individuais, conclusão por série e instruções com fotos locais em 17 exercícios.
- Última execução por exercício e cópia da primeira série para a segunda.
- Salvar e encerrar treino parcial ou completo, preservando histórico e limpando marcações para um novo treino.
- Histórico com filtros, continuar sessões em andamento e editar registros encerrados com salvar/cancelar.
- Excluir e desfazer a última exclusão nesta abertura do aplicativo.
- Evolução mensal por exercício: carga, segundos na prancha ou repetições por lado no dead bug.
- Exportação e importação confirmada de backups. A data exibida indica uma solicitação de download; confira o arquivo na pasta de downloads.

## Supabase e publicação

Instruções do banco, Auth e redirecionamentos em [supabase/README.md](supabase/README.md). `supabase-config.js` contém apenas a URL e a chave pública publishable fornecidas pelo usuário. Nunca incluir service_role, chave secret ou senha do banco no frontend.

O SQL inicial foi executado pelo usuário no projeto online; catálogo confirmado pela API (18 exercícios e 3 fichas) e chamada privada sem login recusada. Login real com e-mail e gravação de um treino real ainda precisam ser validados pelo usuário. O teste de RLS automatizado roda localmente, sem credenciais de produção.

Para GitHub Pages: Settings → Pages → Deploy from a branch → main → / (root). Os caminhos são relativos e suportam `/nosso-treino/`. Não há etapa de build no servidor: bundle.js e cloud-bundle.js já estão gerados e versionados. A publicação só estará confirmada após o GitHub fornecer a URL ativa.

## Limitações

Sem integração automática com o HTML legado `treino-caio-nicolli-v2:`: suas chaves são preservadas, mas o formato não foi fornecido. Sem prescrição automática de mudanças na ficha. Manifest/PWA e partilha autorizada entre parceiros ficam para etapas futuras.

# Nosso Treino

Aplicativo mobile-first de treinos A/B/C para Caio e Nicolli, em HTML, CSS e JavaScript. Interface em português, tema escuro, fichas oficiais com 18 exercícios e duas séries por exercício.

## Executar

Use Node.js 22 ou superior. Execute `npm ci`, `npm run build` e `npm run dev`. Abra http://127.0.0.1:4173/nosso-treino/. Os bundles são versionados para publicação estática no GitHub Pages e também permitem abrir index.html diretamente. Prefira HTTP/HTTPS para autenticação e uma origem de armazenamento consistente. Após editar fontes, execute novamente `npm run build`.

## Testes

`npm test` verifica os fluxos locais, edição/cancelamento, restauração de exclusões, importação, troca de conta, fila de sincronização, conflitos entre aparelhos, falhas de rede e armazenamento. PGlite executa a migração em PostgreSQL real em memória e verifica RLS entre dois usuários. Nenhuma conta de produção ou treino real é criado pelos testes.

## Registros e contas

- Sem login: dados dos dois perfis no navegador, com alternância rápida. São registros compartilhados neste dispositivo, sem barreira de autenticação.
- Menu **Conta e sincronização**: criar conta por e-mail/senha, entrar, sair, tentar sincronizar e consultar o estado do envio.
- Cada conta online representa Caio ou Nicolli. O nome é fixado na primeira abertura; contas existentes usam o perfil já registrado no banco. Após vincular as contas por convite, selecionar o nome no topo permite registrar e editar os treinos dos dois sem trocar o login.
- Para o fluxo pessoal escolhido, desative Confirm email em Authentication → Sign In / Providers no Supabase. O e-mail passa a ser apenas o identificador de login, sem depender de link para cadastrar ou entrar. Cada pessoa usa seu próprio e-mail. Essa alteração é administrativa no painel; o frontend não a modifica. Contas que já estavam pendentes podem exigir uma confirmação administrativa única. Senhas são enviadas diretamente ao Supabase pelo SDK oficial e não são gravadas pelo aplicativo.
- Dados locais são preservados durante login/logout. Para levá-los à conta, usar **Importar meus treinos locais** e confirmar o perfil. A importação preserva registros com a mesma identificação.
- Backups incluem os dois perfis no modo local e apenas a conta atual no modo online. Importar arquivo com perfis misturados em uma conta é recusado. Dados de outro domínio, porta ou HTML local não aparecem automaticamente na origem publicada.

## Sincronização

As alterações online entram imediatamente numa fila durável, isolada pela conta autenticada e pelo dono do perfil selecionado. Cada gravação recebe uma chave imutável própria no localStorage; abas não sobrescrevem a fila umas das outras. Ao reabrir, todas as filas pendentes desse perfil são recuperadas. Filas do formato anterior também são preservadas; se não houver uma base confiável para comparar, exigem resolução explícita.

É permitido abrir a mesma conta em várias abas e aparelhos. O envio acontece após uma breve pausa; a versão do servidor é consultada a cada 10 segundos, ao retornar à janela e quando a conexão volta. Navegadores podem suspender consultas em segundo plano. O indicador só confirma sincronização após resposta do servidor. Campos em edição mantêm seus valores e foco; atualizações da tela são adiadas durante a digitação e a edição de um registro.

Cada envio compara a versão original, as mudanças locais e a versão atual do servidor. Alterações em registros diferentes, incluindo exclusões independentes, podem ser combinadas. Duas alterações diferentes no mesmo treino (ou uma edição contra exclusão) interrompem o envio com aviso, preservando os dados locais e os do servidor. Dois novos treinos com a mesma identificação também podem exigir resolução. Se a revisão mudar entre consulta e gravação, a comparação é repetida, com limite de tentativas.

Para resolver um conflito, abra **Conta e sincronização**, use **Exportar cópia deste aparelho** e confira o download. Depois, **Carregar versão do servidor** adota a versão online mediante confirmação, arquivando as filas conhecidas em chaves de recuperação no armazenamento do navegador. Confira o registro e reaplique as alterações desejadas. A importação de backup preserva identificações existentes; não substitui automaticamente um registro em conflito. As cópias internas de recuperação são para suporte, não substituem o arquivo exportado.

A seleção de Caio/Nicolli mantém separadas a identidade do login e a pessoa dos registros. Leituras e gravações do parceiro revalidam o vínculo e o dono exato. Encerrar o vínculo bloqueia novos envios; pendências continuam no aparelho. Trocar de pessoa exige concluir os envios ou resolver os conflitos antes.

A atualização não precisa de nova migração SQL: usa as migrações 001–003 já aplicadas. Atualize todas as abas antes de testar; no iPhone, feche e reabra o aplicativo para carregar os novos arquivos. Ao reabrir sem internet, a conta ainda pode exigir reconexão antes de exibir os registros; o aplicativo não oferece abertura totalmente offline.

### Verificação manual do ponto 2

1. Abra a mesma conta em duas abas atualizadas; ambas devem carregar normalmente.
2. Em cada aba, altere treinos de datas diferentes. Aguarde a confirmação e confira os dois registros nas duas abas (até 10 segundos, sem editar campos).
3. Repita entre computador e iPhone, selecionando também o perfil do parceiro.
4. Abra o mesmo registro nas duas telas e faça alterações diferentes. Sincronize a primeira e depois a segunda: a segunda deve avisar sobre conflito e oferecer exportação, sem substituir a primeira.
5. Com o app já aberto, desligue a rede, registre uma alteração e recarregue após reconectar: a fila deve permanecer. A abertura inicial sem internet ainda não é suportada.
6. Com pendências, tente trocar de pessoa ou sair e entrar novamente; confirme que elas ficam na conta e no perfil corretos. A troca de pessoa deve aguardar o envio.

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

Sem integração automática com o HTML legado `treino-caio-nicolli-v2:`: suas chaves são preservadas, mas o formato não foi fornecido. Sem prescrição automática de mudanças na ficha. Manifest/PWA fica para uma etapa futura.

## Compartilhamento do casal

Requer executar uma vez a segunda migração `supabase/migrations/202610270002_partner_sharing.sql` (não repetir a inicial). Em Conta e sincronização → Compartilhamento do casal, uma pessoa gera um código e a outra revisa e aceita. O convite vale por 24 horas, é de uso único e pode ser cancelado. O código é guardado apenas como hash no banco. Gerar outro invalida o anterior.

O menu Casal mostra histórico, séries e evolução mensal do parceiro em somente leitura, sem substituir o workspace próprio nem entrar na fila de sincronização. Use Atualizar consulta para buscar os registros que o parceiro já enviou ao servidor. Não há atualização em tempo real. Preferências, campos preparados para o próximo treino e e-mail do parceiro não são compartilhados. Sessões em andamento que já foram sincronizadas podem ser consultadas.

Qualquer um pode encerrar o vínculo para os dois; os treinos próprios permanecem intactos. A revogação bloqueia novas consultas. Conteúdo que já foi visualizado ou capturado anteriormente não pode ser retirado do aparelho da outra pessoa. Esta tela não persiste uma cópia do parceiro no localStorage.

Após um login ou cadastro com sessão válido, a janela fecha e a ficha de treino é aberta. A sessão é mantida pelo SDK no aparelho; abrir o aplicativo novamente restaura a conta. O botão Mostrar senha permite conferir o que foi digitado, sem armazenar a senha.

# Nosso Treino

Aplicativo mobile-first para Caio e Nicolli. Etapa 1 em HTML, CSS e JavaScript nativos, sem dependências externas.

## Executar e testar

Requer Node.js 20 ou superior. Execute `npm run dev` e abra http://127.0.0.1:4173/nosso-treino/. Execute `npm test` para testar ficha, agenda, persistência, isolamento de perfis, progresso e backups. O index.html também pode ser aberto diretamente. Após alterar os arquivos JavaScript fonte, execute `npm run build` para atualizar bundle.js. Prefira o servidor local para manter uma origem de armazenamento consistente.

## Implementado

- Dashboard com agenda semanal, recomendação do dia, último treino e contagem semanal.
- Fichas oficiais A/B/C, 18 exercícios, exatamente duas séries por exercício.
- Alternância Caio/Nicolli e data manual; carga, repetições/tempo e conclusão individual por série.
- Instruções textuais locais, músculos e cuidados para cada exercício.
- Salvamento local após alterações válidas; recuperação após atualizar a página; feedback de falha de armazenamento.
- Histórico individual de sessões completas e incompletas e reabertura dos registros.
- Evolução por exercício com carga máxima por sessão, comparação anterior, melhor carga e total mensal de treinos completos.
- Exportação e importação confirmada de backup JSON dos dois perfis, preservando sessões existentes.
- Tema escuro, layout responsivo, áreas seguras e campos acessíveis.

Uma sessão corresponde a um perfil + data + ficha. Reabrir o mesmo treino no mesmo dia retoma a sessão, evitando duplicação. Sem autenticação nesta etapa: os dois perfis são uma conveniência em um dispositivo compartilhado, não uma barreira de segurança. As marcações indicam conclusão informada, mesmo quando carga/repetições estão vazias; gráficos exigem carga e repetições preenchidas em séries concluídas.

## Dados e limitações

Os dados ficam no localStorage da origem atual, chave `nosso-treino:v1`. Não são sincronizados online. Exportar backups regularmente: limpeza do navegador, modo privado ou troca de aparelho podem causar perda. Falhas de escrita são informadas na interface. Se o armazenamento inicial estiver corrompido, o aplicativo não o sobrescreve; exporte os registros da sessão atual antes de resolver o armazenamento no navegador.

Nenhum código anterior foi encontrado neste checkout. Chaves antigas `treino-caio-nicolli-v2:` são preservadas, mas não convertidas, pois o esquema legado não foi fornecido. A importação aceita apenas o backup desta versão. Para migrar a versão anterior, forneça o HTML ou uma exportação de seus dados para mapear os campos sem adivinhação. Dados de outra origem ou de HTML local não ficam disponíveis automaticamente no GitHub Pages.

## GitHub Pages

Arquivos usam caminhos relativos e funcionam sob `/nosso-treino/`. No GitHub, publique a raiz da branch em **Settings → Pages → Deploy from a branch**, pasta `/ (root)`. Não há build. URL esperada após habilitar Pages: `https://caioaganet.github.io/nosso-treino/`.

## Próximas etapas

1. Supabase: obter URL e chave pública reais; criar migrations, Auth, RLS por usuário e sincronização com confirmação do servidor e tratamento de conflitos. A alternância entre identidades autenticadas precisará respeitar as sessões e permissões.
2. Migração legada explícita após conhecer seu formato e com confirmação antes do envio ao banco.
3. Ampliar indicadores de frequência semanal e testes da interface em Android/iPhone reais.
4. PWA com manifest, ícones raster e cache exclusivo de arquivos públicos; não implementado nesta etapa.

Nenhuma credencial, integração Supabase ou publicação online é simulada. Os treinos não são alterados automaticamente.


## Melhorias de uso recentes

- Histórico permite continuar sessões em andamento e editar registros encerrados com salvar/cancelar. Consultar um registro antigo restaura a data anterior ao sair; há ação para voltar para hoje.
- Copiar série 1 para série 2 reutiliza carga e repetições/tempo, deixando a série de destino desmarcada.
- Valores inválidos exibem aviso no exercício e não substituem o último valor válido salvo.
- Evolução considera o mês da data selecionada, incluindo tempo de prancha e repetições por lado no dead bug. Compara o maior valor registrado nas séries concluídas de cada sessão.
- Exclusão pode ser desfeita pela ação no histórico, para a última exclusão feita nesta abertura do aplicativo. A opção não sobrevive à atualização ou fechamento da página.
- Importação reverte alterações em memória quando a gravação falha. A última solicitação de exportação é exibida; o aplicativo não consegue confirmar que o navegador concluiu o download. Confira o arquivo na pasta de downloads.

## Supabase — preparação do banco

A migração SQL e as instruções de execução estão em supabase/README.md. Esta etapa ainda não ativa login nem sincronização no frontend. Execute npm ci antes dos testes para instalar o PostgreSQL em memória usado na validação das políticas.

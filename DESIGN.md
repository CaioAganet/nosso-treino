# Direção visual — Nosso Treino

## Organização do ponto 3

A navegação principal tem três destinos, sempre disponíveis no topo:

- **Treinar:** seleção de pessoa e data, sugestão do dia, fichas A/B/C, exercícios e salvar. A pessoa aparece uma única vez na ficha; o controle fixo reúne progresso e salvar.
- **Progresso:** Histórico, Evolução e Parceiro em uma navegação secundária. O Histórico mantém indicadores semanais, último treino, filtros, consulta, edição, exclusão e desfazer. Evolução mantém os gráficos mensais por exercício.
- **Configurações:** conta e sincronização, compartilhamento por convite e exportação/importação de backup. O acesso à conta continua no diálogo existente.

Saúde é apenas uma indicação de área futura em Configurações: alimentação (calorias e proteínas), peso, IMC e avaliações mensais/trimestrais. Não contém formulários, cálculos, dados ou navegação inativa.

## Aparência e acessibilidade

Tema escuro e verde, com fontes locais do sistema. Fundo #111714, cartões #1b241e, texto #edf2eb, apoio #afbbb1 e destaque #c3ee8b. A tela inicial usa um bloco compacto do dia e fichas, sem arte decorativa grande. Indicadores ficam em Progresso; ferramentas de conta e backup ficam em Configurações.

Controles com área de toque mínima de 44px, campos numéricos com fonte de 16px, indicação de foco e estado ativo acessível. Ícones SVG locais acompanham os rótulos da navegação. O importador permanece acessível por teclado. Os estilos respeitam redução de movimento e áreas seguras do iPhone.

## Validação

Build gerado e 57 testes aprovados, incluindo navegação agrupada, isolamento dos registros, edição, backup e sincronização concorrente. Conferência no Chrome com largura normal e em 390px e 320px: tela inicial, ficha, Histórico, Evolução, Configurações e acesso ao diálogo de conta. Sem rolagem horizontal na conferência de Configurações em 320px. O teste no iPhone instalado fica com o usuário.

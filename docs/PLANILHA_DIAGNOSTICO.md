# Diagnostico da planilha

Data: 2026-05-20

Fonte de evidencia:

- `SHEET_SCHEMA.md`
- `docs/SPREADSHEET_SNAPSHOT.md` atualizado por `npm run snapshot`
- Referencias em `apps-script/Code.js`, `src/schema.js`, `src/domain.js`, `src/event-planner.js`, `src/write-adapter.js`

Nao foi feita nenhuma modificacao na planilha real.

## 1. Abas esperadas pelo sistema

VERIFIED em schema e snapshot: a planilha real tem 13 abas, todas com cabecalhos compativeis:

- `Config_Categorias`
- `Config_Fontes`
- `Cartoes`
- `Faturas`
- `Lancamentos`
- `Transferencias_Internas`
- `Rendas_Recorrentes`
- `Saldos_Fontes`
- `Patrimonio_Ativos`
- `Dividas`
- `Fechamento_Familiar`
- `Idempotency_Log`
- `Telegram_Send_Log`

## 2. Colunas esperadas por aba

Autoridade: `SHEET_SCHEMA.md`.

- `Config_Categorias`: `id_categoria`, `nome`, `grupo`, `tipo_evento_padrao`, `classe_dre`, `escopo_padrao`, `afeta_dre_padrao`, `afeta_patrimonio_padrao`, `afeta_caixa_familiar_padrao`, `visibilidade_padrao`, `ativo`.
- `Config_Fontes`: `id_fonte`, `nome`, `tipo`, `titular`, `moeda`, `ativo`.
- `Cartoes`: `id_cartao`, `id_fonte`, `nome`, `titular`, `fechamento_dia`, `vencimento_dia`, `limite`, `ativo`.
- `Faturas`: `id_fatura`, `id_cartao`, `competencia`, `data_fechamento`, `data_vencimento`, `valor_previsto`, `valor_fechado`, `valor_pago`, `status`.
- `Lancamentos`: `id_lancamento`, `data`, `competencia`, `tipo_evento`, `id_categoria`, `valor`, `id_fonte`, `pessoa`, `escopo`, `id_cartao`, `id_fatura`, `id_divida`, `id_ativo`, `afeta_dre`, `afeta_patrimonio`, `afeta_caixa_familiar`, `visibilidade`, `status`, `descricao`, `parcelas`, `created_at`.
- `Transferencias_Internas`: `id_transferencia`, `data`, `competencia`, `valor`, `fonte_origem`, `fonte_destino`, `pessoa_origem`, `pessoa_destino`, `escopo`, `direcao_caixa_familiar`, `descricao`, `created_at`.
- `Rendas_Recorrentes`: `id_renda`, `pessoa`, `descricao`, `valor_planejado`, `tipo_renda`, `beneficio_restrito`, `ativo`, `observacao`.
- `Saldos_Fontes`: `id_snapshot`, `competencia`, `data_referencia`, `id_fonte`, `saldo_inicial`, `saldo_final`, `saldo_disponivel`, `observacao`, `created_at`.
- `Patrimonio_Ativos`: `id_ativo`, `nome`, `tipo_ativo`, `instituicao`, `saldo_atual`, `data_referencia`, `destinacao`, `conta_reserva_emergencia`, `ativo`.
- `Dividas`: `id_divida`, `nome`, `credor`, `tipo`, `escopo`, `saldo_devedor`, `parcela_atual`, `parcelas_total`, `valor_parcela`, `taxa_juros`, `sistema_amortizacao`, `data_atualizacao`, `status`, `observacao`.
- `Fechamento_Familiar`: `competencia`, `status`, `receitas_dre`, `despesas_dre`, `resultado_dre`, `caixa_entradas`, `caixa_saidas`, `sobra_caixa`, `faturas_60d`, `obrigacoes_60d`, `reserva_total`, `patrimonio_liquido`, `margem_pos_obrigacoes`, `capacidade_aporte_segura`, `parcela_maxima_segura`, `pode_avaliar_amortizacao`, `motivo_bloqueio_amortizacao`, `destino_reserva`, `destino_obrigacoes`, `destino_investimentos`, `destino_amortizacao`, `destino_sugerido`, `observacao`, `created_at`, `closed_at`.
- `Idempotency_Log`: `idempotency_key`, `source`, `external_update_id`, `external_message_id`, `chat_id`, `payload_hash`, `status`, `result_ref`, `created_at`, `updated_at`, `error_code`, `observacao`.
- `Telegram_Send_Log`: `id_notificacao`, `created_at`, `route`, `chat_id`, `phase`, `status`, `status_code`, `error`, `result_ref`, `id_lancamento`, `idempotency_key`, `text_preview`, `sent_at`.

## 3. Colunas realmente usadas no codigo

VERIFIED: todas as colunas acima aparecem em `HEADERS` e sao lidas/escritas por helpers genericos. Uso semantico mais forte:

- Calculo financeiro: `valor`, `tipo_evento`, `competencia`, `afeta_dre`, `afeta_caixa_familiar`, `afeta_patrimonio`, `status`, `valor_previsto`, `valor_fechado`, `valor_pago`, `saldo_atual`, `saldo_devedor`, `valor_parcela`, `conta_reserva_emergencia`, `saldo_final`, `saldo_disponivel`.
- Roteamento e referencias: `id_categoria`, `id_fonte`, `id_cartao`, `id_fatura`, `id_divida`, `id_ativo`, `pessoa`, `escopo`, `visibilidade`, `direcao_caixa_familiar`.
- Faturas: `fechamento_dia`, `vencimento_dia`, `data_fechamento`, `data_vencimento`, `parcelas`.
- Auditoria/idempotencia: `idempotency_key`, `external_update_id`, `external_message_id`, `chat_id`, `result_ref`, `error_code`, `created_at`, `updated_at`.
- UX/privacidade: `descricao`, `visibilidade`, `text_preview`.

## 4. Colunas citadas mas pouco usadas

Estas colunas tem baixo uso semantico direto e parecem mais documentais/operacionais. Nao remover sem confirmacao:

- `Cartoes.limite`
- `Config_Fontes.moeda`
- `Rendas_Recorrentes.tipo_renda`
- `Dividas.credor`, `parcela_atual`, `parcelas_total`, `taxa_juros`, `sistema_amortizacao`
- `Patrimonio_Ativos.tipo_ativo`, `instituicao`, `destinacao`
- `Telegram_Send_Log.id_notificacao`, `route`, `phase`, `status_code`, `text_preview`, `sent_at`

## 5. Colunas duplicadas ou semanticamente redundantes

- `Faturas.valor_previsto`, `valor_fechado`, `valor_pago`: nao sao duplicadas tecnicamente, mas viram fontes concorrentes se uma fatura tem varias linhas previstas e uma linha fechada autoritativa.
- `Saldos_Fontes.saldo_final` e `saldo_disponivel`: podem ser iguais para contas simples, mas nao sao redundantes se houver saldo bloqueado.
- `Lancamentos.id_fonte`, `id_cartao`, `id_fatura`: em compra de cartao, a fonte do cartao e a fatura podem ser derivaveis; manter por rastreabilidade, mas o risco e inconsistencia entre referencias.
- `Fechamento_Familiar.*`: campos sao derivados e nao devem virar fonte primaria para mes aberto.
- `Dividas.saldo_devedor` e `valor_parcela`: um e patrimonial, outro e obrigacao de caixa; precisam continuar separados.

## 6. Abas antigas ou suspeitas

VERIFIED no snapshot: nao ha abas extras; `Sheets: 13` e todas sao conhecidas.

Suspeitas de sujeira operacional dentro das abas:

- `Faturas` tem 155 linhas, incluindo muitas linhas previstas futuras e linhas `fechada` com `valor_previsto=0`.
- `Idempotency_Log` tem 191 linhas para 130 `Lancamentos`, 155 `Faturas` e 2 transferencias; isso e esperado parcialmente, mas deve ser monitorado para duplicidades.
- `Telegram_Send_Log` tem 0 linhas; a fronteira de envio existe, mas nao ha evidencia de log real gravado.

## 7. Formulas frageis ou dificeis de auditar

VERIFIED: o schema e snapshot nao expõem formulas. `docs/FORMULA_STANDARD.md` define padrao futuro.

UNVERIFIED:

- Nao foi inspecionada a planilha real celula a celula para detectar formulas manuais fora do snapshot.
- Se existirem formulas manuais, elas devem ser inventariadas antes de qualquer limpeza.

## 8. Dados derivados que nao deveriam ser fonte primaria

- `Fechamento_Familiar` deve ser snapshot/auditoria de fechamento, nao fonte para recalcular mes aberto.
- `Faturas.valor_fechado` deve ser autoridade apenas quando status/linha deixar claro que a fatura foi fechada ou revisada.
- `Faturas` futuras de parcelamento sao exposicao planejada, nao despesa nova.
- `Saldos_Fontes` sao snapshots informados, nao razao completo de conta bancaria.
- `Patrimonio_Ativos.saldo_atual` e fonte de patrimonio/reserva, nao lancamento DRE.

## 9. Dados que deveriam ser calculados pelo codigo

- `competencia` pode ser derivada de `data`, mas deve continuar persistida para auditoria e estabilidade.
- `data_fechamento` e `data_vencimento` podem ser derivadas de cartao e competencia; persistir ajuda auditoria, mas o codigo deve validar consistencia.
- Totais de `Fechamento_Familiar` devem ser sempre gerados pelo codigo.
- `margem_pos_obrigacoes`, `capacidade_aporte_segura`, `destino_*` devem ser calculados, nao preenchidos manualmente.

## 10. Riscos de inconsistencia entre planilha e codigo

- Enums reais incluem valores operacionais como `cancelado_revisao`, enquanto enums locais documentam `cancelado`.
- Linha fechada autoritativa em `Faturas` pode coexistir com linhas previstas por parcela.
- Alteracao manual na ordem dos cabecalhos quebra runtime imediatamente.
- Categoria/fonte/cartao inativo ainda pode existir em historico; validacao runtime filtra ativos para novas mutacoes.
- Mes fechado (`2026-04`) bloqueia mutacoes exceto `ajuste`, mas reparos operacionais conseguem modificar historico por action especifica.

## 11. Proposta de schema limpo

Manter as 13 abas atuais como schema V55 limpo. Nao criar abas novas agora.

Ajustes propostos para proxima fase:

- Documentar enums aceitos por aba, incluindo status operacionais reais.
- Criar script read-only `sheet:audit` que compara abas, colunas, colunas extras, status invalidos, referencias quebradas e faturas duplicadas.
- Separar semanticamente `Faturas` em tipos por status/observacao antes de qualquer remocao: prevista por compra/parcela, fechada autoritativa, paga, cancelada por revisao.
- Preservar `Fechamento_Familiar` como historico de fechamento, com regeneracao apenas para meses abertos ou via `ajuste`.

## 12. Plano de migracao seguro

1. Criar auditor read-only local/remoto que gere relatorio redigido sem valores privados linha a linha.
2. Exportar backup completo fora do repo antes de qualquer limpeza real.
3. Rodar auditor e marcar candidatos de limpeza, sem alterar planilha.
4. Gerar script de migracao reversivel: toda alteracao deve registrar antes/depois e nunca deletar linhas; preferir status `cancelado_revisao` ou aba backup fora do schema.
5. Aplicar em dry-run.
6. Revisao humana do comparativo antes/depois.
7. Aplicar em lote pequeno.
8. Rodar `npm run snapshot`, `npm run summary`, `npm run selftest`, depois `npm run check`.

## 13. O que pode ser removido com seguranca

Neste momento, nada da planilha real pode ser removido com seguranca apenas pela evidencia atual.

No codigo, ha funcoes privadas aparentemente mortas, mas isso nao autoriza remocao de abas/colunas/dados.

## 14. O que precisa de confirmacao humana antes de remover

- Qualquer linha de `Faturas` com status `cancelado_revisao`, `fechada`, `prevista` antiga ou competencia fechada.
- Qualquer action manual de reparo/migracao em Apps Script.
- Qualquer coluna pouco usada listada neste documento.
- Qualquer formula manual encontrada em auditoria futura.
- Qualquer dado historico de abril de 2026, pois `2026-04` esta fechado.
- Qualquer categoria/fonte/cartao/divida/ativo inativo que ainda esteja referenciado por historico.

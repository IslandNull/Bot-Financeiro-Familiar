# SHEET_SCHEMA.md

This is the V55 sheet schema authority for the clean base. Real spreadsheet presence is VERIFIED for the Phase 6 target by the redacted evidence in `EXECUTION_PLAN.md`.

For the current redacted state of the real spreadsheet, use `docs/SPREADSHEET_SNAPSHOT.md`. That file is operational evidence only; this file remains the schema authority.

## Sheets

### Config_Categorias

`id_categoria | nome | grupo | tipo_evento_padrao | classe_dre | escopo_padrao | afeta_dre_padrao | afeta_patrimonio_padrao | afeta_caixa_familiar_padrao | visibilidade_padrao | ativo`

### Config_Fontes

`id_fonte | nome | tipo | titular | moeda | ativo`

### Cartoes

`id_cartao | id_fonte | nome | titular | fechamento_dia | vencimento_dia | limite | ativo`

### Faturas

`id_fatura | id_cartao | competencia | data_fechamento | data_vencimento | valor_previsto | valor_fechado | valor_pago | status`

### Lancamentos

`id_lancamento | data | competencia | tipo_evento | id_categoria | valor | id_fonte | pessoa | escopo | id_cartao | id_fatura | id_divida | id_ativo | afeta_dre | afeta_patrimonio | afeta_caixa_familiar | visibilidade | status | descricao | created_at`

### Transferencias_Internas

`id_transferencia | data | competencia | valor | fonte_origem | fonte_destino | pessoa_origem | pessoa_destino | escopo | direcao_caixa_familiar | descricao | created_at`

### Rendas_Recorrentes

`id_renda | pessoa | descricao | valor_planejado | tipo_renda | beneficio_restrito | ativo | observacao`

### Saldos_Fontes

`id_snapshot | competencia | data_referencia | id_fonte | saldo_inicial | saldo_final | saldo_disponivel | observacao | created_at`

### Patrimonio_Ativos

`id_ativo | nome | tipo_ativo | instituicao | saldo_atual | data_referencia | destinacao | conta_reserva_emergencia | ativo`

### Dividas

`id_divida | nome | credor | tipo | escopo | saldo_devedor | parcela_atual | parcelas_total | valor_parcela | taxa_juros | sistema_amortizacao | data_atualizacao | status | observacao`

### Fechamento_Familiar

`competencia | status | receitas_dre | despesas_dre | resultado_dre | caixa_entradas | caixa_saidas | sobra_caixa | faturas_60d | obrigacoes_60d | reserva_total | patrimonio_liquido | margem_pos_obrigacoes | capacidade_aporte_segura | parcela_maxima_segura | pode_avaliar_amortizacao | motivo_bloqueio_amortizacao | destino_reserva | destino_obrigacoes | destino_investimentos | destino_amortizacao | destino_sugerido | observacao | created_at | closed_at`

### Idempotency_Log

`idempotency_key | source | external_update_id | external_message_id | chat_id | payload_hash | status | result_ref | created_at | updated_at | error_code | observacao`

### Telegram_Send_Log

`id_notificacao | created_at | route | chat_id | phase | status | status_code | error | result_ref | id_lancamento | idempotency_key | text_preview | sent_at`

## Formula Standard

When formula injection exists later, use Apps Script `range.setFormula()`, English function names, and semicolon separators.

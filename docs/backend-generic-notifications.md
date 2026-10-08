# Sistema Genérico de Notificações — Especificação para o Backend

## Objetivo

Implementar no backend um sistema genérico de notificações baseado em eventos e regras configuráveis.

O sistema não pode ficar diretamente acoplado à criação de despesas nem ao canal Web Push. Deve permitir adicionar novos eventos, condições, destinatários, templates e canais sem alterar os produtores dos eventos.

Casos de utilização iniciais:

- Notificar quando uma despesa é adicionada.
- Notificar quando uma despesa é alterada ou eliminada.
- Notificar quando um orçamento atravessa uma percentagem configurada, por exemplo 80% ou 100%.
- Notificar quando é registada uma despesa acima de determinado valor.
- Notificar quando uma recorrência gera movimentos.
- Permitir futuramente Web Push, email e notificações internas.

## Requisitos fundamentais

1. Uma operação de negócio nunca deve enviar diretamente uma notificação.
2. A operação e o respetivo evento devem ser persistidos atomicamente.
3. Uma falha no fornecedor de notificações não pode anular ou atrasar a operação de negócio.
4. O processamento deve ser idempotente e tolerante a repetições.
5. Os limites percentuais devem disparar apenas quando o limite for atravessado.
6. As preferências dos utilizadores devem ser respeitadas.
7. Cada utilizador pode ter vários destinos por canal, por exemplo várias subscrições Web Push.

## Arquitetura

```text
Operação de negócio
        ↓
Evento guardado na Outbox, na mesma transação
        ↓
NotificationEventWorker
        ↓
Regras configuradas para o tipo de evento
        ↓
Avaliação de condições e resolução de destinatários
        ↓
Notification + NotificationDelivery
        ↓
NotificationDeliveryWorker
        ↓
Web Push / Email / In-App
```

## 1. Eventos

Todos os eventos notificáveis devem usar um envelope comum:

```csharp
public sealed record NotificationEventEnvelope(
    Guid Id,
    string EventType,
    int SchemaVersion,
    Guid? HouseholdId,
    long? ActorUserId,
    Guid? AggregateId,
    string? AggregateType,
    DateTimeOffset OccurredAtUtc,
    JsonDocument Data);
```

Tipos iniciais:

```text
Expense.Created
Expense.Updated
Expense.Deleted
Budget.UsageChanged
Budget.ThresholdReached
RecurringExpense.Materialized
Household.MemberAdded
Household.InvitationAccepted
```

Exemplo de `Expense.Created`:

```json
{
  "id": "0bd97b40-...",
  "eventType": "Expense.Created",
  "schemaVersion": 1,
  "householdId": "8dc2d1f7-...",
  "actorUserId": 123,
  "aggregateId": "12214a2d-...",
  "aggregateType": "Expense",
  "occurredAtUtc": "2026-10-07T10:30:00Z",
  "data": {
    "amount": 23.40,
    "currency": "EUR",
    "description": "Compras",
    "merchantName": "Continente",
    "categoryId": "6e8c1f09-...",
    "categoryName": "Supermercado",
    "date": "2026-10-07"
  }
}
```

Os payloads devem ser versionados. Um consumidor deve rejeitar de forma controlada uma versão que não suporta.

## 2. Outbox

Criar a tabela `NotificationEventOutbox`:

```text
Id                    char(36) / uuid
EventType             varchar(100)
SchemaVersion         int
HouseholdId           nullable
ActorUserId           nullable
AggregateId           nullable
AggregateType         varchar(100) nullable
IdempotencyKey        varchar(300)
PayloadJson           json
OccurredAtUtc         datetime
AvailableAtUtc        datetime
Attempts              int
ProcessedAtUtc        nullable
LastError             varchar(2000) nullable
CreatedAtUtc          datetime
```

Índices:

```text
UNIQUE(IdempotencyKey)
INDEX(ProcessedAtUtc, AvailableAtUtc)
INDEX(HouseholdId, EventType, OccurredAtUtc)
```

Exemplo de chave:

```text
expense-created:{expenseId}
```

O evento deve ser inserido antes do `SaveChangesAsync` que persiste a operação. Para garantir que todos os caminhos são abrangidos, incluindo talões, importações e recorrências, centralizar a criação dos eventos através de domain events, de um interceptor EF Core ou do `FingsDbContext.SaveChangesAsync`.

## 3. Regras configuráveis

Criar `NotificationRule`:

```text
Id                             char(36) / uuid
Name                           varchar(200)
EventType                      varchar(100)
Scope                          varchar(30)
HouseholdId                    nullable
ConditionType                  varchar(100)
ConditionJson                  json
RecipientPolicy               varchar(100)
RecipientConfigurationJson    json nullable
TemplateKey                    varchar(150)
ChannelsJson                   json
CooldownSeconds                int nullable
Priority                       int
IsEnabled                      bool
CreatedAtUtc                   datetime
UpdatedAtUtc                   datetime nullable
```

Scopes suportados:

```text
System
Household
User
```

Exemplo para todas as despesas novas:

```json
{
  "name": "Nova despesa",
  "eventType": "Expense.Created",
  "scope": "Household",
  "householdId": "8dc2d1f7-...",
  "conditionType": "Always",
  "condition": {},
  "recipientPolicy": "HouseholdMembersExceptActor",
  "recipientConfiguration": {},
  "templateKey": "expense-created",
  "channels": ["WebPush"],
  "cooldownSeconds": null,
  "priority": 100,
  "isEnabled": true
}
```

Exemplo para um orçamento a atingir 80%:

```json
{
  "name": "Orçamento próximo do limite",
  "eventType": "Budget.UsageChanged",
  "scope": "Household",
  "householdId": "8dc2d1f7-...",
  "conditionType": "BudgetThresholdCrossed",
  "condition": {
    "thresholdPercentage": 80,
    "direction": "up"
  },
  "recipientPolicy": "AllHouseholdMembers",
  "recipientConfiguration": {},
  "templateKey": "budget-threshold-reached",
  "channels": ["WebPush", "InApp"],
  "cooldownSeconds": 86400,
  "priority": 100,
  "isEnabled": true
}
```

## 4. Avaliadores tipados

Não executar scripts, SQL, expressões dinâmicas ou código guardado na base de dados.

Criar avaliadores conhecidos pelo backend:

```csharp
public interface INotificationRuleEvaluator
{
    string ConditionType { get; }

    Task<RuleEvaluationResult> EvaluateAsync(
        NotificationRule rule,
        NotificationEventEnvelope notificationEvent,
        CancellationToken cancellationToken);
}
```

Implementações iniciais:

```text
AlwaysRuleEvaluator
BudgetThresholdCrossedRuleEvaluator
ExpenseAmountAboveRuleEvaluator
CategoryExpenseThresholdRuleEvaluator
MonthlyExpenseThresholdRuleEvaluator
```

Cada avaliador deve desserializar `ConditionJson` para um DTO tipado e validado.

## 5. Limites de orçamento

Um alerta de 80% não pode ser enviado em todas as despesas posteriores.

Condição de cruzamento ascendente:

```text
previousPercentage < thresholdPercentage
currentPercentage >= thresholdPercentage
```

O evento `Budget.UsageChanged` deve conter pelo menos:

```json
{
  "budgetId": "d9a07af1-...",
  "period": "2026-10",
  "categoryId": null,
  "budgetAmount": 1000,
  "previousSpentAmount": 760,
  "currentSpentAmount": 820,
  "previousPercentage": 76,
  "currentPercentage": 82
}
```

Chave de deduplicação global:

```text
budget:{budgetId}:{period}:threshold:{percentage}
```

Para uma categoria:

```text
budget:{budgetId}:{period}:category:{categoryId}:threshold:{percentage}
```

Uma alteração ou eliminação de despesa também deve gerar `Budget.UsageChanged` quando afetar os totais do orçamento.

## 6. Políticas de destinatários

Criar resolvedores reutilizáveis:

```csharp
public interface INotificationRecipientResolver
{
    string PolicyName { get; }

    Task<IReadOnlyList<long>> ResolveAsync(
        NotificationRule rule,
        NotificationEventEnvelope notificationEvent,
        CancellationToken cancellationToken);
}
```

Políticas iniciais:

```text
AllHouseholdMembers
HouseholdMembersExceptActor
HouseholdOwners
HouseholdManagers
SpecificUsers
ActorOnly
```

Um destinatário deve:

- Ter uma conta associada.
- Estar ativo.
- Continuar a pertencer ao agregado.
- Ter o tipo de notificação ativo nas preferências.
- Ter pelo menos um destino ativo para o canal selecionado.

## 7. Preferências

Criar `NotificationPreference`:

```text
Id                    char(36) / uuid
UserId                bigint
HouseholdId           nullable
NotificationType      varchar(100)
Channel               varchar(50)
IsEnabled             bool
CreatedAtUtc          datetime
UpdatedAtUtc          datetime nullable
```

Índice único:

```text
UNIQUE(UserId, HouseholdId, NotificationType, Channel)
```

A ausência de preferência deve usar um valor predefinido explicitamente configurado por tipo de notificação.

## 8. Templates

Criar `NotificationTemplate`:

```text
Id                    char(36) / uuid
TemplateKey           varchar(150)
Channel               varchar(50)
Locale                varchar(20)
TitleTemplate         varchar(250)
BodyTemplate          varchar(1000)
ActionUrlTemplate     varchar(1000) nullable
IsActive              bool
CreatedAtUtc          datetime
UpdatedAtUtc          datetime nullable
```

Índice único:

```text
UNIQUE(TemplateKey, Channel, Locale)
```

Exemplo:

```json
{
  "templateKey": "expense-created",
  "channel": "WebPush",
  "locale": "pt-PT",
  "titleTemplate": "Nova despesa em {{householdName}}",
  "bodyTemplate": "{{actorName}} adicionou {{amount}} — {{description}}",
  "actionUrlTemplate": "/?view=expenses&expenseId={{expenseId}}"
}
```

Usar apenas tokens definidos numa allowlist por tipo de evento. Não permitir execução de código nos templates.

Fallback de idioma:

```text
Idioma do utilizador → idioma do agregado → pt-PT
```

## 9. Notificações e entregas

Separar a notificação lógica das entregas por canal.

### Notification

```text
Id                    char(36) / uuid
RuleId                char(36)
EventId               char(36)
UserId                bigint
HouseholdId           nullable
NotificationType      varchar(100)
Title                 varchar(250)
Body                  varchar(1000)
ActionUrl             varchar(1000) nullable
DeduplicationKey      varchar(400)
CreatedAtUtc          datetime
ReadAtUtc             datetime nullable
```

### NotificationDelivery

```text
Id                    char(36) / uuid
NotificationId        char(36)
Channel               varchar(50)
DestinationId         char(36) nullable
Status                varchar(30)
Attempts              int
AvailableAtUtc        datetime
SentAtUtc             datetime nullable
LastError             varchar(2000) nullable
ProviderMessageId     varchar(500) nullable
CreatedAtUtc          datetime
UpdatedAtUtc          datetime nullable
```

Estados:

```text
Pending
Processing
Sent
Failed
Cancelled
```

Índice de idempotência:

```text
UNIQUE(UserId, DeduplicationKey, Channel, DestinationId)
```

## 10. Canais

Criar uma abstração independente do motor de regras:

```csharp
public interface INotificationChannel
{
    string ChannelName { get; }

    Task<DeliveryResult> SendAsync(
        Notification notification,
        NotificationDelivery delivery,
        CancellationToken cancellationToken);
}
```

Implementações previstas:

```text
WebPushNotificationChannel
EmailNotificationChannel
InAppNotificationChannel
```

Adicionar um canal não deve exigir alterações nos produtores de eventos nem nos avaliadores.

## 11. Web Push

Instalar uma biblioteca compatível com o protocolo Web Push e VAPID, por exemplo:

```bash
dotnet add package WebPush
```

Configuração:

```json
{
  "WebPush": {
    "Subject": "mailto:suporte@fings.pt",
    "PublicKey": "",
    "PrivateKey": ""
  }
}
```

Em produção, usar secrets ou variáveis de ambiente:

```text
WebPush__Subject
WebPush__PublicKey
WebPush__PrivateKey
```

A chave privada nunca pode ser devolvida por nenhum endpoint.

### PushSubscription

```text
Id                    char(36) / uuid
UserId                bigint
Endpoint              varchar(2048)
P256dh                varchar(255)
Auth                  varchar(255)
ExpirationTimeUtc     datetime nullable
DeviceName            varchar(200) nullable
UserAgent             varchar(500) nullable
IsActive              bool
LastUsedAtUtc         datetime nullable
CreatedAtUtc          datetime
UpdatedAtUtc          datetime nullable
```

Índices:

```text
UNIQUE(Endpoint)
INDEX(UserId, IsActive)
```

Endpoints autenticados:

```http
GET    /api/push/public-key
PUT    /api/push/subscriptions
GET    /api/push/subscriptions
DELETE /api/push/subscriptions/{subscriptionId}
```

O backend deve associar a subscrição ao utilizador do JWT. Nunca aceitar um `UserId` fornecido pelo cliente.

Payload de uma notificação:

```json
{
  "title": "Nova despesa em Família Silva",
  "body": "João adicionou 23,40 € — Continente",
  "icon": "/icon-192.png",
  "badge": "/icon-192.png",
  "url": "/?view=expenses&expenseId=12214a2d-...",
  "tag": "expense-12214a2d-..."
}
```

Não incluir tokens, chaves ou informação especialmente sensível no payload.

## 12. Workers

### NotificationEventWorker

Responsabilidades:

1. Obter eventos pendentes da outbox.
2. Bloquear o lote para evitar processamento concorrente duplicado.
3. Obter regras ativas para o `EventType` e scope.
4. Avaliar as condições.
5. Resolver os destinatários.
6. Aplicar preferências e cooldowns.
7. Renderizar os templates.
8. Criar `Notification` e `NotificationDelivery`.
9. Marcar o evento como processado.

### NotificationDeliveryWorker

Responsabilidades:

1. Obter entregas pendentes.
2. Bloquear o lote para evitar envio duplicado.
3. Resolver o `INotificationChannel`.
4. Enviar a notificação.
5. Atualizar estado, tentativas e erros.
6. Reagendar erros temporários.
7. Desativar destinos inválidos.

Os workers devem suportar múltiplas instâncias da aplicação sem processar o mesmo registo simultaneamente.

## 13. Retry

Backoff recomendado:

```text
Tentativa 1: imediata
Tentativa 2: 1 minuto
Tentativa 3: 5 minutos
Tentativa 4: 30 minutos
Tentativa 5: 2 horas
```

Depois do limite, marcar como `Failed`.

Para Web Push:

```text
404 ou 410    desativar subscrição
408 ou 429    repetir
5xx           repetir
outros 4xx    falha definitiva
```

Uma falha num destino não pode bloquear os restantes destinos.

## 14. API de configuração

Criar endpoints administrativos:

```http
GET    /api/notification-rules
POST   /api/notification-rules
GET    /api/notification-rules/{ruleId}
PATCH  /api/notification-rules/{ruleId}
DELETE /api/notification-rules/{ruleId}
POST   /api/notification-rules/{ruleId}/test
```

Validar sempre:

- Se o `EventType` existe.
- Se o `ConditionType` é compatível com o evento.
- Se `ConditionJson` corresponde ao DTO esperado.
- Se a política de destinatários existe.
- Se o template existe para os canais indicados.
- Se os canais estão disponíveis.
- Se percentagens estão entre 0 e 100.
- Se o utilizador pode gerir regras no scope indicado.

Eliminar uma regra deve, preferencialmente, desativá-la para preservar o histórico.

Endpoints de preferências:

```http
GET /api/notification-preferences
PUT /api/notification-preferences
```

## 15. Integração com despesas e orçamentos

### Despesas

Emitir eventos para todas as origens:

- Registo manual.
- Digitalização de talão.
- Importação de despesas anteriores.
- Materialização de recorrências.
- Qualquer futura integração externa.

### Orçamentos

Depois de uma operação que altere o valor gasto:

1. Calcular o valor anterior.
2. Calcular o novo valor.
3. Criar `Budget.UsageChanged`.
4. Deixar o avaliador decidir se um limite foi atravessado.

Não codificar diretamente limites de 80% ou 100% no serviço de despesas.

## 16. Segurança

- Associar subscrições exclusivamente através do JWT.
- Guardar chaves privadas apenas em secrets.
- Não registar `Auth`, `P256dh` ou chaves privadas nos logs.
- Validar endpoints Web Push contra SSRF e acessos a redes privadas.
- Aplicar limites de tamanho aos endpoints e chaves.
- Aplicar rate limiting aos endpoints de subscrição.
- Autorizar a gestão de regras por scope e papel.
- Impedir acesso cruzado entre agregados.
- Validar estritamente todo o JSON configurável.
- Usar tokens permitidos e conhecidos nos templates.
- Evitar detalhes financeiros sensíveis quando a notificação pode aparecer num ecrã bloqueado.

## 17. Observabilidade

Métricas recomendadas:

```text
notification_events_created_total
notification_events_processed_total
notification_events_failed_total
notification_rules_evaluated_total
notification_rules_matched_total
notification_deliveries_sent_total
notification_deliveries_failed_total
notification_delivery_duration_seconds
notification_subscriptions_deactivated_total
notification_outbox_pending
notification_delivery_pending
```

Contexto mínimo nos logs:

```text
EventId
RuleId
NotificationId
DeliveryId
Channel
HouseholdId
Status
Attempt
```

Nunca incluir secrets ou chaves das subscrições.

## 18. Testes obrigatórios

### Eventos e outbox

- Criar uma despesa cria exatamente um evento `Expense.Created`.
- Talões, importações e recorrências produzem o mesmo tipo de evento.
- Uma falha ao persistir o evento também faz rollback da operação.
- Reprocessar o mesmo evento não cria notificações duplicadas.

### Regras

- Uma regra `Always` corresponde ao evento correto.
- Uma regra não é aplicada a outro agregado.
- Condições inválidas são rejeitadas.
- Regras desativadas não produzem notificações.
- Cooldowns são respeitados.

### Orçamentos

- A passagem de 76% para 82% dispara o limite de 80%.
- A passagem de 82% para 85% não volta a disparar 80%.
- Limites de 80% e 100% podem coexistir.
- Orçamentos e categorias diferentes têm deduplicação independente.
- Um novo período mensal permite novos alertas.

### Destinatários

- Apenas membros ativos recebem notificações.
- A política `HouseholdMembersExceptActor` exclui o ator.
- Preferências desativadas são respeitadas.
- Um utilizador com vários dispositivos recebe uma entrega por dispositivo.

### Entregas

- Um erro temporário agenda nova tentativa.
- Uma resposta Web Push 404 ou 410 desativa a subscrição.
- Uma falha de envio não altera a operação de negócio.
- Falhar num dispositivo não bloqueia os restantes.

### Segurança

- Um utilizador não consegue gerir subscrições de outro.
- Um administrador de uma família não consegue gerir regras de outra.
- Endpoints e payloads inválidos são rejeitados.
- Nenhum secret é devolvido pela API.

## 19. Fases recomendadas

### Fase 1 — Fundação

- Eventos versionados.
- Outbox transacional.
- Regras `Always`.
- Políticas de destinatários.
- Templates.
- Notificações e entregas.
- Web Push.
- Evento `Expense.Created`.

### Fase 2 — Orçamentos

- Evento `Budget.UsageChanged`.
- Avaliador `BudgetThresholdCrossed`.
- Deduplicação por período e limite.
- Regras configuráveis de 80%, 100% ou outros valores.

### Fase 3 — Expansão

- Email.
- Notificações internas.
- Novos avaliadores.
- Gestão administrativa de regras.
- Preferências mais granulares.
- Histórico e auditoria.

## 20. Critérios de aceitação

- Adicionar um tipo de evento não exige alterar os canais.
- Adicionar um canal não exige alterar os produtores de eventos.
- As regras podem ser globais ou específicas de uma família.
- As condições são avaliadas por componentes tipados.
- Eventos e operações de negócio são persistidos atomicamente.
- O envio é assíncrono, idempotente e tolerante a falhas.
- Limites percentuais notificam apenas quando são atravessados.
- Preferências, scopes e permissões são respeitados.
- Subscrições inválidas são desativadas automaticamente.
- A mesma arquitetura suporta despesas, orçamentos e futuros domínios.

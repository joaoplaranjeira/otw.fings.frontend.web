const API_URL = (import.meta.env.VITE_FINGS_API_URL || 'http://localhost:5015').replace(/\/$/, '')

export type ReceiptImageQuality = { score: number; level: string; acceptedWithRisk: boolean; warnings: string[] }

export class ApiError extends Error {
  status: number
  fields?: Record<string, string[]>
  code?: string
  imageQuality?: ReceiptImageQuality

  constructor(status: number, message: string, fields?: Record<string, string[]>, code?: string, imageQuality?: ReceiptImageQuality) {
    super(message)
    this.status = status
    this.fields = fields
    this.code = code
    this.imageQuality = imageQuality
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const isForm = options.body instanceof FormData
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (response.status === 401) window.dispatchEvent(new CustomEvent('fings:unauthorized'))
    throw new ApiError(
      response.status,
      body.detail || body.message || (response.status === 429 ? 'Demasiadas tentativas. Aguarda um momento.' : 'Não foi possível concluir o pedido.'),
      body.errors,
      body.code,
      body.imageQuality,
    )
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export type Household = { id: string; name: string; currency: string; timeZone: string; role: number }
export type User = { id: number; name: string; username: string; email: string }
export type HouseholdRole = { value: number; name: string }
export type HouseholdRelationship = { value: number; name: string }
export type HouseholdMember = {
  id: string; userId?: number | null; name: string; username?: string | null; email?: string | null; isActive?: boolean | null
  role?: number | null; relationship?: number | null; birthDate?: string | null
}
export type CreateHouseholdMemberPayload = { name:string; relationship:number; birthDate:string; email?:string|null; role?:number|null }
export type UpdateHouseholdMemberPayload = { name:string; relationship:number; birthDate:string; role?:number|null }
export type HouseholdInvitation = {
  id: string; householdId: string; householdName: string; email: string; role: number; emailSent: boolean; status: number
  expiresAt: string; createdAt: string; acceptedAt?: string | null; code?: string; invitationUrl?: string
}
export type HouseholdInvitationPreview = { householdName: string; maskedEmail: string; role: number; expiresAt: string }
export type Category = {
  id: string; name: string; color?: string; icon?: string; isActive: boolean
  subcategories: { id: string; name: string; isActive: boolean }[]
}
export type ExpenseLine = {
  id: string; description: string; quantity?: number | null; unitPrice?: number | null; amount: number
  categoryId: string; categoryName: string; subcategoryId?: string | null; subcategoryName?: string | null; position: number
}
export type Expense = {
  id: string; date: string; amount: number; description: string; categoryId: string; categoryName: string
  subcategoryId?: string | null; subcategoryName?: string | null; merchantName?: string | null; merchantTaxNumber?: string | null
  origin: number; status: number; lines: ExpenseLine[]
}
export type ExpenseSuggestion = {
  description: string; merchantName: string; merchantTaxNumber?: string | null; categoryId: string; categoryName: string
  subcategoryId?: string | null; subcategoryName?: string | null; occurrenceCount: number; lastOccurrenceDate: string
}
export type ExpensePayloadLine = {
  categoryId: string; subcategoryId?: string | null; description: string
  quantity?: number | null; unitPrice?: number | null; amount: number
}
export type ExpensePayload = {
  categoryId?: string | null; subcategoryId?: string | null; date: string; amount: number; description: string
  merchantName?: string | null; merchantTaxNumber?: string | null; origin: number; lines?: ExpensePayloadLine[] | null
}
export type UpdateExpensePayload = Omit<ExpensePayload, 'origin'>
export type Dashboard = {
  month: string; budget: number; plannedIncome: number; confirmedExpenses: number; available: number
  categories: { categoryId: string; categoryName: string; budget: number | null; spent: number; available: number | null }[]
}
export type Budget = {
  id: string; name: string; startMonth: string; endMonth: string; monthlyAmount: number; status: number; generatedIncomeCount: number
  allocations: { categoryId: string; categoryName: string; monthlyAmount: number }[]
}
export type RecurringExpense = {
  id: string; categoryId: string; subcategoryId?: string; description: string; merchantName?: string
  merchantTaxNumber?: string; amount: number; frequency: number; startDate: string; endDate?: string
  nextOccurrenceDate: string; isActive: boolean
}
export type RecurringExpensePayload = Omit<RecurringExpense, 'id' | 'nextOccurrenceDate' | 'isActive'>
export type CreateRecurringExpensePayload = RecurringExpensePayload & { materializeNow?: boolean }
export type RecurringExpenseMaterialization = { createdCount: number; throughDate: string; nextOccurrenceDate: string; isActive: boolean }
export type ReceiptParseLine = {
  description: string; quantity?: number | null; unitPrice?: number | null; amount: number
  suggestedCategoryId?: string | null; suggestedCategoryName?: string | null
  suggestedSubcategoryId?: string | null; suggestedSubcategoryName?: string | null; confidence: number
}
export type ReceiptParseResult = {
  parseId: string; merchantName?: string | null; merchantTaxNumber?: string | null; documentNumber?: string | null
  purchaseDate?: string | null; currency: string; subtotal?: number | null; tax?: number | null; total: number; linesTotal: number
  lines: ReceiptParseLine[]; warnings: string[]; imageQuality: ReceiptImageQuality
}
export type NotificationChannel = 'WebPush' | 'Email' | 'InApp'
export type FingsNotification = {
  id: string; householdId?: string | null; notificationType: string; title: string; body: string
  actionUrl?: string | null; createdAtUtc: string; readAtUtc?: string | null
}
export type NotificationPreference = {
  householdId?: string | null; notificationType: string; channel: NotificationChannel; isEnabled: boolean
}
export type PushSubscriptionInfo = {
  id: string; endpoint: string; expirationTimeUtc?: string | null; deviceName?: string | null
  isActive: boolean; createdAtUtc: string; lastUsedAtUtc?: string | null
}
export type PushSubscriptionPayload = {
  endpoint: string; p256dh: string; auth: string; expirationTimeUtc?: string | null; deviceName?: string | null
}

export const api = {
  sendOtp: (email: string) => request<{ success: boolean; message: string; expiresAt: string }>('/api/otp/send', { method: 'POST', body: JSON.stringify({ email }) }),
  validateOtp: (email: string, code: string) => request<{ success: boolean; token: string }>('/api/otp/validate', { method: 'POST', body: JSON.stringify({ email, code }) }),
  register: (data: { name: string; username: string; email: string; householdName?: string; invitationCode?: string }) => request('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  me: (token: string) => request<User>('/api/users/me', {}, token),
  updateProfile: (data: { name: string; username: string }, token: string) => request<User>('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) }, token),
  households: (token: string) => request<Household[]>('/api/households', {}, token),
  householdRoles: (token: string) => request<HouseholdRole[]>('/api/household-roles', {}, token),
  householdRelationships: (token: string) => request<HouseholdRelationship[]>('/api/household-relationships', {}, token),
  householdMembers: (householdId: string, token: string) => request<HouseholdMember[]>(`/api/households/${householdId}/members`, {}, token),
  addHouseholdMember: (householdId: string, data: CreateHouseholdMemberPayload, token: string) => request<HouseholdMember>(`/api/households/${householdId}/members`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateHouseholdMember: (householdId: string, memberId:string, data:UpdateHouseholdMemberPayload, token:string) => request<HouseholdMember>(`/api/households/${householdId}/members/${memberId}`, { method:'PUT', body:JSON.stringify(data) }, token),
  removeHouseholdMember: (householdId: string, memberId: string, token: string) => request<void>(`/api/households/${householdId}/members/${memberId}`, { method: 'DELETE' }, token),
  householdInvitations: (householdId: string, token: string) => request<HouseholdInvitation[]>(`/api/households/${householdId}/invitations`, {}, token),
  createHouseholdInvitation: (householdId: string, data: { email: string; role: number }, token: string) => request<HouseholdInvitation>(`/api/households/${householdId}/invitations`, { method: 'POST', body: JSON.stringify(data) }, token),
  sendHouseholdInvitationEmail: (householdId: string, invitationId: string, token: string) => request<{ id:string; email:string; emailSent:boolean }>(`/api/households/${householdId}/invitations/${invitationId}/send-email`, { method: 'POST' }, token),
  revokeHouseholdInvitation: (householdId: string, invitationId: string, token: string) => request<void>(`/api/households/${householdId}/invitations/${invitationId}`, { method: 'DELETE' }, token),
  regenerateHouseholdInvitation: (householdId: string, invitationId: string, token: string) => request<HouseholdInvitation>(`/api/households/${householdId}/invitations/${invitationId}/regenerate-code`, { method: 'POST' }, token),
  householdInvitation: (code: string) => request<HouseholdInvitationPreview>(`/api/household-invitations/${encodeURIComponent(code)}`),
  acceptHouseholdInvitation: (code: string, token: string) => request<HouseholdMember>(`/api/household-invitations/${encodeURIComponent(code)}/accept`, { method: 'POST' }, token),
  categories: (householdId: string, token: string) => request<Category[]>(`/api/households/${householdId}/categories`, {}, token),
  expenses: (householdId: string, from: string, to: string, token: string) => request<Expense[]>(`/api/households/${householdId}/expenses?from=${from}&to=${to}`, {}, token),
  expenseSuggestions: (householdId: string, token: string) => request<ExpenseSuggestion[]>(`/api/households/${householdId}/expenses/suggestions`, {}, token),
  dashboard: (householdId: string, year: number, month: number, token: string) => request<Dashboard>(`/api/households/${householdId}/dashboard/${year}/${month}`, {}, token),
  budgets: (householdId: string, token: string) => request<Budget[]>(`/api/households/${householdId}/budgets`, {}, token),
  recurringExpenses: (householdId: string, token: string) => request<RecurringExpense[]>(`/api/households/${householdId}/recurring-expenses`, {}, token),
  createRecurringExpense: (householdId: string, data: CreateRecurringExpensePayload, token: string) => request<RecurringExpense>(`/api/households/${householdId}/recurring-expenses`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateRecurringExpense: (householdId: string, recurringExpenseId: string, data: RecurringExpensePayload, token: string) => request<RecurringExpense>(`/api/households/${householdId}/recurring-expenses/${recurringExpenseId}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  materializeRecurringExpense: (householdId: string, recurringExpenseId: string, token: string) => request<RecurringExpenseMaterialization>(`/api/households/${householdId}/recurring-expenses/${recurringExpenseId}/materialize`, { method: 'POST' }, token),
  createExpense: (householdId: string, data: ExpensePayload, token: string) => request<Expense>(`/api/households/${householdId}/expenses`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateExpense: (householdId: string, expenseId: string, data: UpdateExpensePayload, token: string) => request<Expense>(`/api/households/${householdId}/expenses/${expenseId}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  deleteExpense: (householdId: string, expenseId: string, token: string) => request<void>(`/api/households/${householdId}/expenses/${expenseId}`, { method: 'DELETE' }, token),
  replaceExpenseLines: (householdId: string, expenseId: string, lines: ExpensePayloadLine[], token: string) => request<Expense>(`/api/households/${householdId}/expenses/${expenseId}/lines`, { method: 'PUT', body: JSON.stringify({ lines }) }, token),
  createCategory: (householdId: string, data: { name: string; color?: string; icon?: string }, token: string) => request<Category>(`/api/households/${householdId}/categories`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateCategory: (householdId: string, categoryId: string, data: { name: string; color?: string; icon?: string }, token: string) => request<Category>(`/api/households/${householdId}/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  createSubcategory: (householdId: string, categoryId: string, name: string, token: string) => request<Category['subcategories'][number]>(`/api/households/${householdId}/categories/${categoryId}/subcategories`, { method: 'POST', body: JSON.stringify({ name }) }, token),
  updateSubcategory: (householdId: string, categoryId: string, subcategoryId: string, name: string, token: string) => request<Category['subcategories'][number]>(`/api/households/${householdId}/categories/${categoryId}/subcategories/${subcategoryId}`, { method: 'PATCH', body: JSON.stringify({ name }) }, token),
  createBudget: (householdId: string, data: object, token: string) => request<Budget>(`/api/households/${householdId}/budgets`, { method: 'POST', body: JSON.stringify(data) }, token),
  parseReceipt: (householdId: string, file: File, token: string, acceptLowQuality = false) => {
    const form = new FormData(); form.append('file', file)
    return request<ReceiptParseResult>(`/api/households/${householdId}/receipts/parse?acceptLowQuality=${acceptLowQuality}`, { method: 'POST', body: form }, token)
  },
  validateReceiptParse: (householdId: string, parseId: string, data: { isValid: boolean; notes?: string | null }, token: string) => request(`/api/households/${householdId}/receipts/parses/${parseId}/validation`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  notifications: (token: string, unreadOnly = false) => request<FingsNotification[]>(`/api/notifications?unreadOnly=${unreadOnly}`, {}, token),
  markNotificationRead: (notificationId: string, token: string) => request<void>(`/api/notifications/${notificationId}/read`, { method: 'POST' }, token),
  notificationPreferences: (token: string) => request<NotificationPreference[]>('/api/notification-preferences', {}, token),
  updateNotificationPreferences: (preferences: NotificationPreference[], token: string) => request<NotificationPreference[]>('/api/notification-preferences', { method: 'PUT', body: JSON.stringify({ preferences }) }, token),
  pushPublicKey: (token: string) => request<{ publicKey: string }>('/api/push/public-key', {}, token),
  pushSubscriptions: (token: string) => request<PushSubscriptionInfo[]>('/api/push/subscriptions', {}, token),
  putPushSubscription: (subscription: PushSubscriptionPayload, token: string) => request<PushSubscriptionInfo>('/api/push/subscriptions', { method: 'PUT', body: JSON.stringify(subscription) }, token),
  deletePushSubscription: (subscriptionId: string, token: string) => request<void>(`/api/push/subscriptions/${subscriptionId}`, { method: 'DELETE' }, token),
}

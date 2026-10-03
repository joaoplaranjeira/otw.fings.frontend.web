const API_URL = (import.meta.env.VITE_FINGS_API_URL || 'http://localhost:5015').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  fields?: Record<string, string[]>

  constructor(status: number, message: string, fields?: Record<string, string[]>) {
    super(message)
    this.status = status
    this.fields = fields
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
    )
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export type Household = { id: string; name: string; currency: string; timeZone: string; role: number }
export type User = { id: number; name: string; username: string; email: string }
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
  lines: ReceiptParseLine[]; warnings: string[]
}

export const api = {
  sendOtp: (email: string) => request<{ success: boolean; message: string; expiresAt: string }>('/api/otp/send', { method: 'POST', body: JSON.stringify({ email }) }),
  validateOtp: (email: string, code: string) => request<{ success: boolean; token: string }>('/api/otp/validate', { method: 'POST', body: JSON.stringify({ email, code }) }),
  register: (data: { name: string; username: string; email: string; householdName: string }) => request('/api/users', { method: 'POST', body: JSON.stringify(data) }),
  me: (token: string) => request<User>('/api/users/me', {}, token),
  updateProfile: (data: { name: string; username: string }, token: string) => request<User>('/api/users/me', { method: 'PATCH', body: JSON.stringify(data) }, token),
  households: (token: string) => request<Household[]>('/api/households', {}, token),
  categories: (householdId: string, token: string) => request<Category[]>(`/api/households/${householdId}/categories`, {}, token),
  expenses: (householdId: string, from: string, to: string, token: string) => request<Expense[]>(`/api/households/${householdId}/expenses?from=${from}&to=${to}`, {}, token),
  dashboard: (householdId: string, year: number, month: number, token: string) => request<Dashboard>(`/api/households/${householdId}/dashboard/${year}/${month}`, {}, token),
  budgets: (householdId: string, token: string) => request<Budget[]>(`/api/households/${householdId}/budgets`, {}, token),
  recurringExpenses: (householdId: string, token: string) => request<RecurringExpense[]>(`/api/households/${householdId}/recurring-expenses`, {}, token),
  createRecurringExpense: (householdId: string, data: CreateRecurringExpensePayload, token: string) => request<RecurringExpense>(`/api/households/${householdId}/recurring-expenses`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateRecurringExpense: (householdId: string, recurringExpenseId: string, data: RecurringExpensePayload, token: string) => request<RecurringExpense>(`/api/households/${householdId}/recurring-expenses/${recurringExpenseId}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  materializeRecurringExpense: (householdId: string, recurringExpenseId: string, token: string) => request<RecurringExpenseMaterialization>(`/api/households/${householdId}/recurring-expenses/${recurringExpenseId}/materialize`, { method: 'POST' }, token),
  createExpense: (householdId: string, data: ExpensePayload, token: string) => request<Expense>(`/api/households/${householdId}/expenses`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateExpense: (householdId: string, expenseId: string, data: UpdateExpensePayload, token: string) => request<Expense>(`/api/households/${householdId}/expenses/${expenseId}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  replaceExpenseLines: (householdId: string, expenseId: string, lines: ExpensePayloadLine[], token: string) => request<Expense>(`/api/households/${householdId}/expenses/${expenseId}/lines`, { method: 'PUT', body: JSON.stringify({ lines }) }, token),
  createCategory: (householdId: string, data: { name: string; color?: string; icon?: string }, token: string) => request<Category>(`/api/households/${householdId}/categories`, { method: 'POST', body: JSON.stringify(data) }, token),
  updateCategory: (householdId: string, categoryId: string, data: { name: string; color?: string; icon?: string }, token: string) => request<Category>(`/api/households/${householdId}/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  createSubcategory: (householdId: string, categoryId: string, name: string, token: string) => request<Category['subcategories'][number]>(`/api/households/${householdId}/categories/${categoryId}/subcategories`, { method: 'POST', body: JSON.stringify({ name }) }, token),
  updateSubcategory: (householdId: string, categoryId: string, subcategoryId: string, name: string, token: string) => request<Category['subcategories'][number]>(`/api/households/${householdId}/categories/${categoryId}/subcategories/${subcategoryId}`, { method: 'PATCH', body: JSON.stringify({ name }) }, token),
  createBudget: (householdId: string, data: object, token: string) => request<Budget>(`/api/households/${householdId}/budgets`, { method: 'POST', body: JSON.stringify(data) }, token),
  parseReceipt: (householdId: string, file: File, token: string) => {
    const form = new FormData(); form.append('file', file)
    return request<ReceiptParseResult>(`/api/households/${householdId}/receipts/parse`, { method: 'POST', body: form }, token)
  },
  validateReceiptParse: (householdId: string, parseId: string, data: { isValid: boolean; notes?: string | null }, token: string) => request(`/api/households/${householdId}/receipts/parses/${parseId}/validation`, { method: 'PATCH', body: JSON.stringify(data) }, token),
}

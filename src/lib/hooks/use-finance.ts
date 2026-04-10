'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/providers/auth-provider'
import { generateId } from '@/lib/utils/id'
import type {
  FinanceEntry, FinanceType, Asset, AssetType, AssetHistory,
  Stock, Dividend, Loan, BudgetCategory, TaxSchedule,
  FinanceParam, PeriodicExpense,
} from '@/lib/supabase/types'

// ── Finance Entries (収支) ──

export function useFinanceEntries(limit = 500) {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['finance', user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance')
        .select('*')
        .order('date', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data as FinanceEntry[]
    },
    enabled: !!user,
  })
}

type CreateFinanceInput = {
  type: FinanceType
  amount: number
  category?: string
  memo?: string
  date?: string
  store?: string
}

export function useCreateFinanceEntry() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateFinanceInput) => {
      if (!user) throw new Error('Not authenticated')
      const entry = {
        id: generateId(),
        user_id: user.id,
        type: input.type,
        amount: input.amount,
        category: input.category ?? null,
        memo: input.memo ?? '',
        date: input.date ?? new Date().toISOString().slice(0, 10),
        store: input.store ?? '',
        receipt_url: '',
      }
      const { data, error } = await supabase.from('finance').insert(entry).select().single()
      if (error) throw error
      return data as FinanceEntry
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  })
}

export function useDeleteFinanceEntry() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('finance').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  })
}

// ── Budget Categories ──

export function useBudgetCategories() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['budget_categories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('budget_categories')
        .select('*')
        .order('category', { ascending: true })
      if (error) throw error
      return data as BudgetCategory[]
    },
    enabled: !!user,
  })
}

// ── Assets ──

export function useAssets() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['assets', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .order('asset_type', { ascending: true })
      if (error) throw error
      return data as Asset[]
    },
    enabled: !!user,
  })
}

export function useCreateAsset() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { assetType: AssetType; name: string; amount: number; unit?: string; memo?: string }) => {
      if (!user) throw new Error('Not authenticated')
      const asset = {
        id: generateId(),
        user_id: user.id,
        asset_type: input.assetType,
        name: input.name,
        amount: input.amount,
        unit: input.unit ?? '円',
        memo: input.memo ?? '',
      }
      const { data, error } = await supabase.from('assets').insert(asset).select().single()
      if (error) throw error
      return data as Asset
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  })
}

export function useDeleteAsset() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  })
}

// ── Asset History ──

export function useAssetHistory(months = 12) {
  const { user } = useAuth()
  const supabase = createClient()
  const since = new Date()
  since.setMonth(since.getMonth() - months)

  return useQuery({
    queryKey: ['asset_history', user?.id, months],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asset_history')
        .select('*')
        .gte('snapshot_date', since.toISOString().slice(0, 10))
        .order('snapshot_date', { ascending: true })
      if (error) throw error
      return data as AssetHistory[]
    },
    enabled: !!user,
  })
}

// ── Stocks ──

export function useStocks(status: 'active' | 'all' = 'active') {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['stocks', user?.id, status],
    queryFn: async () => {
      let q = supabase.from('stocks').select('*').order('acquired_date', { ascending: false })
      if (status !== 'all') q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return data as Stock[]
    },
    enabled: !!user,
  })
}

export function useDividends() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['dividends', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dividends')
        .select('*')
        .order('received_date', { ascending: false })
      if (error) throw error
      return data as Dividend[]
    },
    enabled: !!user,
  })
}

// ── Stock Mutations ──

export function useCreateStock() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { ticker: string; name: string; exchange?: string; currency?: string; shares: number; costBasis: number; acquiredDate?: string; currentPrice?: number; broker?: string }) => {
      if (!user) throw new Error('Not authenticated')
      const stock = {
        id: generateId(),
        user_id: user.id,
        ticker: input.ticker,
        name: input.name,
        exchange: input.exchange ?? '',
        currency: input.currency ?? 'JPY',
        shares: input.shares,
        cost_basis: input.costBasis,
        acquired_date: input.acquiredDate ?? new Date().toISOString().slice(0, 10),
        current_price: input.currentPrice ?? 0,
        status: 'active' as const,
        broker: input.broker ?? '',
      }
      const { data, error } = await supabase.from('stocks').insert(stock).select().single()
      if (error) throw error
      return data as Stock
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stocks'] }),
  })
}

export function useUpdateStock() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; shares?: number; cost_basis?: number; name?: string; ticker?: string; current_price?: number }) => {
      const { error } = await supabase.from('stocks').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stocks'] }),
  })
}

export function useAddDividend() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { stockId: string; amount: number; receivedDate?: string; note?: string }) => {
      if (!user) throw new Error('Not authenticated')
      const div = {
        id: generateId(),
        user_id: user.id,
        stock_id: input.stockId,
        amount: input.amount,
        received_date: input.receivedDate ?? new Date().toISOString().slice(0, 10),
        note: input.note ?? '',
      }
      const { data, error } = await supabase.from('dividends').insert(div).select().single()
      if (error) throw error
      return data as Dividend
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dividends'] }),
  })
}

export function useDeleteDividend() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dividends').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dividends'] }),
  })
}

// ── Loans ──

export function useLoans() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['loans', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .order('start_ym', { ascending: false })
      if (error) throw error
      return data as Loan[]
    },
    enabled: !!user,
  })
}

// ── Tax Schedule ──

export function useTaxSchedule() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['tax_schedule', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_schedule')
        .select('*')
        .order('due_date', { ascending: true })
      if (error) throw error
      return data as TaxSchedule[]
    },
    enabled: !!user,
  })
}

// ── Finance Params (収入・固定費設定) ──

export function useFinanceParams() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['finance_params', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('finance_params')
        .select('*')
        .order('category', { ascending: true })
      if (error) throw error
      return data as FinanceParam[]
    },
    enabled: !!user,
  })
}

// ── Finance Param Mutations ──

type CreateParamInput = {
  category: 'income' | 'fixed_expense'
  name: string
  amount: number
  costType?: string
  startYm?: string
  parent?: string
}

export function useCreateFinanceParam() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateParamInput) => {
      const { error } = await supabase.from('finance_params').insert({
        id: generateId(),
        user_id: user!.id,
        category: input.category,
        name: input.name,
        amount: input.amount,
        cost_type: input.costType ?? 'taxable',
        start_ym: input.startYm ?? '',
        end_ym: '',
        parent: input.parent ?? '',
        memo: '',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance_params'] }),
  })
}

export function useDeleteFinanceParam() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (paramId: string) => {
      const { error } = await supabase.from('finance_params').delete().eq('id', paramId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance_params'] }),
  })
}

/**
 * Forward fill: 指定月以降の金額を一括変更
 * 既存paramのend_ymを fromYm-1 に設定し、新paramを fromYm〜 で作成
 */
export function useForwardFillParam() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ paramId, newAmount, fromYm }: { paramId: string; newAmount: number; fromYm: string }) => {
      // 1. 既存paramを取得
      const { data: param } = await supabase.from('finance_params').select('*').eq('id', paramId).single()
      if (!param) throw new Error('Param not found')
      // 2. 既存のend_ymを fromYm-1 に設定
      const prevYm = addMonthsStr(fromYm, -1)
      await supabase.from('finance_params').update({ end_ym: prevYm }).eq('id', paramId)
      // 3. 新paramを作成（fromYm〜）
      await supabase.from('finance_params').insert({
        id: generateId(),
        user_id: user!.id,
        category: param.category,
        name: param.name,
        amount: newAmount,
        cost_type: param.cost_type,
        start_ym: fromYm,
        end_ym: param.end_ym || '',
        parent: param.parent || '',
        memo: param.memo || '',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance_params'] }),
  })
}

/**
 * Spot edit: 特定月のみ金額変更
 * 既存paramを3分割: [start~ym-1] [ym~ym (新金額)] [ym+1~end]
 */
export function useSpotEditParam() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ paramId, newAmount, ym }: { paramId: string; newAmount: number; ym: string }) => {
      const { data: param } = await supabase.from('finance_params').select('*').eq('id', paramId).single()
      if (!param) throw new Error('Param not found')
      const prevYm = addMonthsStr(ym, -1)
      const nextYm = addMonthsStr(ym, 1)
      // 1. 既存のend_ymを ym-1 に
      await supabase.from('finance_params').update({ end_ym: prevYm }).eq('id', paramId)
      // 2. spotレコード (ym~ym)
      await supabase.from('finance_params').insert({
        id: generateId(), user_id: user!.id,
        category: param.category, name: param.name, amount: newAmount,
        cost_type: param.cost_type, start_ym: ym, end_ym: ym,
        parent: param.parent || '', memo: param.memo || '',
      })
      // 3. 残りレコード (ym+1~元end)
      if (!param.end_ym || param.end_ym >= nextYm) {
        await supabase.from('finance_params').insert({
          id: generateId(), user_id: user!.id,
          category: param.category, name: param.name, amount: param.amount,
          cost_type: param.cost_type, start_ym: nextYm, end_ym: param.end_ym || '',
          parent: param.parent || '', memo: param.memo || '',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance_params'] }),
  })
}

// ── Budget Category Mutations ──

export function useUpsertBudget() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { category: string; monthlyBudget: number; startYm?: string; parent?: string }) => {
      const { error } = await supabase.from('budget_categories').insert({
        id: generateId(),
        user_id: user!.id,
        category: input.category,
        monthly_budget: input.monthlyBudget,
        start_ym: input.startYm ?? '',
        end_ym: '',
        parent: input.parent ?? '',
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useDeleteBudget() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (category: string) => {
      const { error } = await supabase.from('budget_categories').delete().eq('category', category)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useForwardFillBudget() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ category, newAmount, fromYm }: { category: string; newAmount: number; fromYm: string }) => {
      // 現在のアクティブbudgetを終了して新しいのを作成
      const { data: budgets } = await supabase.from('budget_categories')
        .select('*').eq('category', category).eq('user_id', user!.id)
        .order('start_ym', { ascending: false }).limit(1)
      const current = budgets?.[0]
      if (current) {
        const prevYm = addMonthsStr(fromYm, -1)
        await supabase.from('budget_categories').update({ end_ym: prevYm }).eq('id', current.id)
      }
      await supabase.from('budget_categories').insert({
        id: generateId(), user_id: user!.id,
        category, monthly_budget: newAmount,
        start_ym: fromYm, end_ym: '',
        parent: current?.parent ?? '',
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

export function useSpotEditBudget() {
  const { user } = useAuth()
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ category, newAmount, ym }: { category: string; newAmount: number; ym: string }) => {
      const { data: budgets } = await supabase.from('budget_categories')
        .select('*').eq('category', category).eq('user_id', user!.id)
        .order('start_ym', { ascending: false }).limit(1)
      const current = budgets?.[0]
      const prevYm = addMonthsStr(ym, -1)
      const nextYm = addMonthsStr(ym, 1)
      if (current) {
        await supabase.from('budget_categories').update({ end_ym: prevYm }).eq('id', current.id)
      }
      // Spot
      await supabase.from('budget_categories').insert({
        id: generateId(), user_id: user!.id,
        category, monthly_budget: newAmount,
        start_ym: ym, end_ym: ym, parent: current?.parent ?? '',
      })
      // Remainder
      if (!current?.end_ym || current.end_ym >= nextYm) {
        await supabase.from('budget_categories').insert({
          id: generateId(), user_id: user!.id,
          category, monthly_budget: current?.monthly_budget ?? newAmount,
          start_ym: nextYm, end_ym: current?.end_ym ?? '',
          parent: current?.parent ?? '',
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget_categories'] }),
  })
}

/** YYYYMMの月加算ヘルパー */
function addMonthsStr(ym: string, months: number): string {
  const y = parseInt(ym.substring(0, 4))
  const m = parseInt(ym.substring(4, 6))
  const d = new Date(y, m - 1 + months, 1)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Periodic Expenses (定期支出) ──

export function usePeriodicExpenses() {
  const { user } = useAuth()
  const supabase = createClient()

  return useQuery({
    queryKey: ['periodic_expenses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('periodic_expenses')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data as PeriodicExpense[]
    },
    enabled: !!user,
  })
}

// ── Loan Amortization ──

export type LoanPayment = {
  month: number
  ym: string
  payment: number
  interest: number
  principalPart: number
  remaining: number
}

export function calcAmortization(loan: Loan): LoanPayment[] {
  const payments: LoanPayment[] = []
  const monthlyRate = loan.annual_rate / 100 / 12
  let remaining = loan.principal
  const startY = Math.floor(loan.start_ym / 100)
  const startM = loan.start_ym % 100

  if (loan.method === 'equal_payment') {
    const mp = monthlyRate > 0
      ? (loan.principal * monthlyRate * Math.pow(1 + monthlyRate, loan.total_payments)) /
        (Math.pow(1 + monthlyRate, loan.total_payments) - 1)
      : loan.principal / loan.total_payments

    for (let i = 1; i <= loan.total_payments; i++) {
      const interest = Math.round(remaining * monthlyRate)
      const principalPart = Math.round(mp - interest)
      remaining = Math.max(0, remaining - principalPart)
      const m = ((startM - 1 + i) % 12) + 1
      const y = startY + Math.floor((startM - 1 + i) / 12)
      payments.push({ month: i, ym: `${y}/${String(m).padStart(2, '0')}`, payment: Math.round(mp), interest, principalPart, remaining })
    }
  } else {
    const monthlyPrincipal = Math.round(loan.principal / loan.total_payments)
    for (let i = 1; i <= loan.total_payments; i++) {
      const interest = Math.round(remaining * monthlyRate)
      const principalPart = i === loan.total_payments ? remaining : monthlyPrincipal
      remaining = Math.max(0, remaining - principalPart)
      const m = ((startM - 1 + i) % 12) + 1
      const y = startY + Math.floor((startM - 1 + i) / 12)
      payments.push({ month: i, ym: `${y}/${String(m).padStart(2, '0')}`, payment: interest + principalPart, interest, principalPart, remaining })
    }
  }
  return payments
}

// ── Forecast ──

export type DetailItem = { name: string; amount: number; paramId?: string; subs?: DetailItem[] }

export type ForecastMonth = {
  ym: string
  label: string
  isCurrent: boolean
  isPast: boolean
  income: number
  incomeDetails: DetailItem[]
  fixedExp: number
  fixedDetails: DetailItem[]
  varExp: number
  varDetails: DetailItem[]
  periodicExp: number
  periodicDetails: DetailItem[]
  loanPayment: number
  loanDetails: DetailItem[]
  taxPayment: number
  taxDetails: DetailItem[]
  withholding: number
  socialIns: number
  netCashFlow: number
  runningCash: number
}

export function calcForecast(opts: {
  incomeParams: FinanceParam[]
  fixedParams: FinanceParam[]
  periodicExpenses: PeriodicExpense[]
  loans: Loan[]
  taxes: TaxSchedule[]
  budgetCategories?: BudgetCategory[]
  initialCash: number
  entries?: FinanceEntry[]
}): ForecastMonth[] {
  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  const curYm = `${curY}${String(curM).padStart(2, '0')}`
  const months: ForecastMonth[] = []
  let running = opts.initialCash

  // Build parent→children map for fixed expenses
  const fixedParentMap: Record<string, FinanceParam[]> = {}
  const topFixed: FinanceParam[] = []
  for (const p of opts.fixedParams) {
    if (p.parent) {
      if (!fixedParentMap[p.parent]) fixedParentMap[p.parent] = []
      fixedParentMap[p.parent].push(p)
    } else {
      topFixed.push(p)
    }
  }

  for (let i = 0; i < 18; i++) {
    const d = new Date(curY, curM - 1 + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const ym = `${y}${String(m).padStart(2, '0')}`
    const label = `${y}年${m}月`
    const ymPrefix = `${y}-${String(m).padStart(2, '0')}`

    const isActive = (p: FinanceParam) => (!p.start_ym || p.start_ym <= ym) && (!p.end_ym || p.end_ym >= ym)

    // Income details
    const activeIncome = opts.incomeParams.filter(isActive)
    const incomeDetails: DetailItem[] = activeIncome.map(p => ({ name: p.name, amount: p.amount, paramId: p.id }))
    const income = activeIncome.reduce((s, p) => s + p.amount, 0)

    // 源泉徴収・社会保険の月次計算 (GAS版 076_BudgetApi.js L208-231 準拠)
    let withholding = 0
    let socialIns = 0
    activeIncome.forEach(p => {
      if (p.cost_type === 'executive' || p.cost_type === 'executive_no_si') {
        const siRate = p.cost_type === 'executive' ? 0.15 : 0
        const monthSi = Math.round(p.amount * siRate)
        socialIns += monthSi
        // 源泉所得税（甲欄・扶養0人）
        const taxBase = p.amount - monthSi
        let monthTax = 0
        if (taxBase <= 88000) monthTax = 0
        else if (taxBase <= 162500) monthTax = Math.round((taxBase - 88000) * 0.05)
        else if (taxBase <= 275000) monthTax = Math.round((taxBase - 162500) * 0.10 + 3700)
        else if (taxBase <= 579167) monthTax = Math.round((taxBase - 275000) * 0.20 + 14950)
        else if (taxBase <= 750000) monthTax = Math.round((taxBase - 579167) * 0.23 + 75783)
        else if (taxBase <= 1500000) monthTax = Math.round((taxBase - 750000) * 0.33 + 115083)
        else monthTax = Math.round((taxBase - 1500000) * 0.40 + 362583)
        // 復興特別所得税 2.1%
        monthTax = Math.round(monthTax * 1.021)
        withholding += monthTax
      }
    })

    // Fixed expense details (with subs)
    const fixedDetails: DetailItem[] = topFixed.filter(isActive).map(p => {
      const subs = (fixedParentMap[p.name] ?? []).filter(isActive).map(sp => ({ name: sp.name, amount: sp.amount, paramId: sp.id }))
      return { name: p.name, amount: p.amount, paramId: p.id, subs: subs.length > 0 ? subs : undefined }
    })
    const fixedExp = fixedDetails.reduce((s, d) => s + d.amount, 0)

    // Variable expenses (from budget categories + actual entries)
    // GAS版 budgetRepo_resolveForYm 準拠: 期間フィルタ + カテゴリdedup（最新start_ym優先）
    let varExp = 0
    const varDetails: DetailItem[] = []
    if (opts.budgetCategories) {
      // 1. この月に有効なbudgetをフィルタ
      const activeBudgets = opts.budgetCategories.filter(b => {
        const start = b.start_ym || '000000'
        const end = b.end_ym || '999999'
        return ym >= start && ym <= end
      })
      // 2. カテゴリごとにdedup（最新start_ym優先）
      const seen = new Map<string, BudgetCategory>()
      for (const b of activeBudgets) {
        const existing = seen.get(b.category)
        if (!existing || (b.start_ym || '') > (existing.start_ym || '')) {
          seen.set(b.category, b)
        }
      }
      // 3. parentなしのトップレベルのみ
      for (const bc of seen.values()) {
        if (bc.parent) continue
        const budget = bc.monthly_budget
        if (ym <= curYm && opts.entries) {
          const actual = opts.entries.filter(e => e.date.startsWith(ymPrefix) && e.type === 'expense' && e.category === bc.category).reduce((s, e) => s + e.amount, 0)
          varDetails.push({ name: bc.category, amount: actual || budget })
          varExp += actual || budget
        } else {
          varDetails.push({ name: bc.category, amount: budget })
          varExp += budget
        }
      }
    }

    // Periodic expenses
    const activePeriodicExps = opts.periodicExpenses.filter(pe => {
      if (y < pe.start_year) return false
      const monthsSinceStart = (y - pe.start_year) * 12 + (m - pe.month)
      return monthsSinceStart >= 0 && monthsSinceStart % pe.interval_months === 0
    })
    const periodicDetails: DetailItem[] = activePeriodicExps.map(pe => ({ name: pe.name, amount: pe.amount }))
    const periodicExp = activePeriodicExps.reduce((s, pe) => s + pe.amount, 0)

    // Loan payments
    const loanDetails: DetailItem[] = []
    let loanPayment = 0
    for (const loan of opts.loans) {
      const sched = calcAmortization(loan)
      const startY = Math.floor(loan.start_ym / 100)
      const startM = loan.start_ym % 100
      const monthIndex = (y - startY) * 12 + (m - startM)
      if (monthIndex >= 0 && monthIndex < sched.length) {
        loanDetails.push({ name: loan.loan_name, amount: sched[monthIndex].payment })
        loanPayment += sched[monthIndex].payment
      }
    }

    // Tax payments
    const activeTaxes = opts.taxes.filter(t => t.status === 'pending' && t.due_date.startsWith(ymPrefix))
    const taxDetails: DetailItem[] = activeTaxes.map(t => ({ name: t.tax_type, amount: t.estimated_amount }))
    const taxPayment = activeTaxes.reduce((s, t) => s + t.estimated_amount, 0)

    const totalExp = fixedExp + varExp + periodicExp + loanPayment + taxPayment + withholding + socialIns
    const netCashFlow = income - totalExp
    running += netCashFlow

    const isPast = ym < curYm

    months.push({
      ym, label, isCurrent: ym === curYm, isPast,
      income, incomeDetails,
      fixedExp, fixedDetails,
      varExp, varDetails,
      periodicExp, periodicDetails,
      loanPayment, loanDetails,
      taxPayment, taxDetails,
      withholding, socialIns,
      netCashFlow, runningCash: running,
    })
  }

  return months
}

// ── Summary helpers ──

export function calcMonthlySummary(entries: FinanceEntry[], ym: string) {
  const prefix = `${ym.slice(0, 4)}-${ym.slice(4, 6)}`
  const monthlyEntries = entries.filter(e => e.date.startsWith(prefix))
  const income = monthlyEntries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const expense = monthlyEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const expByCategory: Record<string, number> = {}
  for (const e of monthlyEntries.filter(e => e.type === 'expense')) {
    const cat = e.category || '未分類'
    expByCategory[cat] = (expByCategory[cat] ?? 0) + e.amount
  }
  return { income, expense, balance: income - expense, expByCategory, entries: monthlyEntries }
}

export function calcAssetTotals(assets: Asset[], stocks: Stock[]) {
  let cash = 0, stock = 0, fund = 0, other = 0
  for (const a of assets) {
    if (a.asset_type === 'cash') cash += a.amount
    else if (a.asset_type === 'stock') stock += a.amount
    else if (a.asset_type === 'fund') fund += a.amount
    else other += a.amount
  }
  for (const s of stocks) {
    if (s.status === 'active') stock += s.shares * s.current_price
  }
  return { cash, stock, fund, other, total: cash + stock + fund + other }
}

/** Format large yen amounts compactly: 万 */
export function compactYen(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 10000) return `${(v / 10000).toFixed(1)}万`
  return v.toLocaleString()
}

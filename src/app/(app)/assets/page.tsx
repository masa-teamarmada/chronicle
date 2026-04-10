'use client'

import { useState, useMemo } from 'react'
import { PiggyBank, Plus, Trash2, Loader2, X } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { cn } from '@/lib/utils'
import {
  useAssets, useCreateAsset, useDeleteAsset, useAssetHistory,
  useStocks, useDividends, calcAssetTotals, compactYen,
  useCreateStock, useUpdateStock, useAddDividend, useDeleteDividend,
} from '@/lib/hooks/use-finance'
import type { AssetType, Stock, Dividend } from '@/lib/supabase/types'

const PIE_COLORS = ['#D4543C', '#C49A2A', '#3A8A5C', '#5B7BD8', '#A06090', '#D09030', '#50A0A0', '#C07070', '#7A9A5A', '#8070B0']

export default function AssetsPage() {
  const { data: assets, isLoading: assetsLoading } = useAssets()
  const { data: stocks, isLoading: stocksLoading } = useStocks()
  const { data: dividends } = useDividends()
  const { data: history } = useAssetHistory(120) // ALL
  const createAsset = useCreateAsset()
  const deleteAsset = useDeleteAsset()
  const createStock = useCreateStock()
  const updateStock = useUpdateStock()
  const addDividend = useAddDividend()
  const deleteDividend = useDeleteDividend()

  const [range, setRange] = useState<number>(0) // 0=ALL
  const [chartMode, setChartMode] = useState('total')
  const [showAddForm, setShowAddForm] = useState(false)
  const [addType, setAddType] = useState<AssetType>('cash')
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')

  // Stock detail modal
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [editShares, setEditShares] = useState('')
  const [editCostBasis, setEditCostBasis] = useState('')

  // Add dividend form (inside stock detail modal)
  const [showDivForm, setShowDivForm] = useState(false)
  const [divAmount, setDivAmount] = useState('')
  const [divDate, setDivDate] = useState(new Date().toISOString().slice(0, 10))
  const [divNote, setDivNote] = useState('')

  // Add stock form
  const [showAddStock, setShowAddStock] = useState(false)
  const [newTicker, setNewTicker] = useState('')
  const [newStockName, setNewStockName] = useState('')
  const [newShares, setNewShares] = useState('')
  const [newCostBasis, setNewCostBasis] = useState('')
  const [newCurrentPrice, setNewCurrentPrice] = useState('')

  const totals = assets && stocks ? calcAssetTotals(assets, stocks) : null
  const isLoading = assetsLoading || stocksLoading

  // ── Chart mode options ──
  const modeOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = [{ key: 'total', label: '全資産合計' }]
    // Distinct series from asset_history
    if (history?.length) {
      const seen = new Set<string>()
      for (const h of history) {
        if (!seen.has(h.asset_key)) {
          seen.add(h.asset_key)
          opts.push({ key: h.asset_key, label: h.asset_name })
        }
      }
    }
    return opts
  }, [history])

  // ── Chart data (GAS版 listAssetHistory 準拠: forward-fill + cash cost_basis=amount) ──
  const historyData = useMemo(() => {
    if (!history?.length) return []

    // 1. 日付一覧・キー一覧
    const dateSet = new Set<string>()
    const keyMap = new Map<string, string>() // key → name
    for (const h of history) {
      dateSet.add(h.snapshot_date)
      if (!keyMap.has(h.asset_key)) keyMap.set(h.asset_key, h.asset_name)
    }
    const dates = [...dateSet].sort()
    const keys = [...keyMap.keys()]

    // 2. cashかどうか判定（asset_keyがasset_で始まるもの）
    const cashKeys = new Set<string>()
    for (const k of keys) {
      if (k.startsWith('asset_')) {
        // assetsデータがあればasset_typeで判定、なければcash扱い
        const assetId = k.replace('asset_', '')
        const asset = assets?.find(a => a.id === assetId)
        if (!asset || asset.asset_type === 'cash') cashKeys.add(k)
      }
    }

    // 3. forward-fill: 各資産の時系列データを前方補完
    const series: Record<string, number[]> = {}
    const costSeries: Record<string, number[]> = {}
    const lastKnown: Record<string, number> = {}
    const lastKnownCost: Record<string, number> = {}
    for (const k of keys) {
      series[k] = []
      costSeries[k] = []
      lastKnown[k] = 0
      lastKnownCost[k] = 0
    }

    for (const d of dates) {
      const dayData = history.filter(h => h.snapshot_date === d)
      for (const k of keys) {
        const found = dayData.find(h => h.asset_key === k)
        if (found) {
          lastKnown[k] = found.amount
          // cost_basisが0で、前回は非0だった場合は前回値を引き継ぐ
          // （GAS同期時にcost_basisが0で上書きされるバグへの対処）
          const newCost = found.cost_basis || 0
          if (newCost > 0) {
            lastKnownCost[k] = newCost
          } else if (lastKnownCost[k] > 0 && !cashKeys.has(k)) {
            // 投資系アセットでcost_basisが0→前回値を維持
            // (cashKeysは後で cost_basis=amount に上書きされるので問題ない)
          } else {
            lastKnownCost[k] = newCost
          }
          series[k].push(found.amount)
          costSeries[k].push(lastKnownCost[k])
        } else {
          // forward-fill: 前の値を引き継ぐ
          series[k].push(lastKnown[k])
          costSeries[k].push(lastKnownCost[k])
        }
      }
    }

    // 4. cashのcost_basis = amount（GAS版 L122-128 準拠）
    for (const k of cashKeys) {
      for (let i = 0; i < dates.length; i++) {
        costSeries[k][i] = series[k][i]
      }
    }

    // 5. チャートモードに応じてデータ生成
    let data: { date: string; 評価額: number; 投資元本: number }[]

    if (chartMode === 'total') {
      data = dates.map((d, i) => ({
        date: d,
        評価額: keys.reduce((sum, k) => sum + (series[k][i] || 0), 0),
        投資元本: keys.reduce((sum, k) => sum + (costSeries[k][i] || 0), 0),
      }))
    } else {
      const k = chartMode
      data = dates.map((d, i) => ({
        date: d,
        評価額: series[k]?.[i] ?? 0,
        投資元本: costSeries[k]?.[i] ?? 0,
      }))
    }

    if (range > 0) {
      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - range)
      const cutoffStr = cutoff.toISOString().slice(0, 10)
      data = data.filter(d => d.date >= cutoffStr)
    }
    return data
  }, [history, assets, range, chartMode])

  const latestGain = historyData.length > 0 ? historyData[historyData.length - 1].評価額 - historyData[historyData.length - 1].投資元本 : 0
  const latestCost = historyData.length > 0 ? historyData[historyData.length - 1].投資元本 : 0
  const gainPct = latestCost > 0 ? ((latestGain / latestCost) * 100).toFixed(1) : '—'

  // ── Portfolio items for doughnut ──
  const portfolioItems = useMemo(() => {
    const items: { name: string; value: number }[] = []
    for (const a of assets ?? []) {
      if (a.amount > 0) items.push({ name: a.name, value: a.amount })
    }
    for (const s of stocks ?? []) {
      if (s.status === 'active') items.push({ name: s.name, value: s.shares * s.current_price })
    }
    return items.sort((a, b) => b.value - a.value)
  }, [assets, stocks])

  const portfolioTotal = portfolioItems.reduce((s, i) => s + i.value, 0)

  // ── Stock P&L ──
  const totalDivs = dividends?.reduce((s, d) => s + d.amount, 0) ?? 0

  const handleAdd = async () => {
    if (!addName || !addAmount) return
    await createAsset.mutateAsync({ assetType: addType, name: addName, amount: Number(addAmount) })
    setAddName(''); setAddAmount(''); setShowAddForm(false)
  }

  const openStockDetail = (st: Stock) => {
    setSelectedStock(st)
    setEditShares(String(st.shares))
    setEditCostBasis(String(st.cost_basis))
    setShowDivForm(false)
  }

  const handleUpdateStock = async () => {
    if (!selectedStock) return
    const shares = Number(editShares)
    const cost_basis = Number(editCostBasis)
    if (shares <= 0) return
    await updateStock.mutateAsync({ id: selectedStock.id, shares, cost_basis })
    setSelectedStock(prev => prev ? { ...prev, shares, cost_basis } : null)
  }

  const handleAddDividend = async () => {
    if (!selectedStock || !divAmount) return
    await addDividend.mutateAsync({ stockId: selectedStock.id, amount: Number(divAmount), receivedDate: divDate, note: divNote })
    setDivAmount(''); setDivNote(''); setShowDivForm(false)
  }

  const handleAddStock = async () => {
    if (!newTicker || !newStockName || !newShares) return
    await createStock.mutateAsync({
      ticker: newTicker,
      name: newStockName,
      shares: Number(newShares),
      costBasis: Number(newCostBasis) || 0,
      currentPrice: Number(newCurrentPrice) || 0,
    })
    setNewTicker(''); setNewStockName(''); setNewShares(''); setNewCostBasis(''); setNewCurrentPrice('')
    setShowAddStock(false)
  }

  // Dividends for selected stock
  const stockDividends = selectedStock
    ? (dividends ?? []).filter(d => d.stock_id === selectedStock.id).sort((a, b) => b.received_date.localeCompare(a.received_date))
    : []
  const stockDivTotal = stockDividends.reduce((s, d) => s + d.amount, 0)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-20">
        <Loader2 className="w-4 h-4 animate-spin" /> 読み込み中...
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* ── Header: Total + Breakdown ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-mono font-bold">¥{(totals?.total ?? 0).toLocaleString()}</span>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {totals && totals.cash > 0 && <span>現金 ¥{totals.cash.toLocaleString()}</span>}
          {totals && totals.stock > 0 && <span>株式 ¥{totals.stock.toLocaleString()}</span>}
          {totals && totals.fund > 0 && <span>ファンド ¥{totals.fund.toLocaleString()}</span>}
          {totals && totals.other > 0 && <span>他 ¥{totals.other.toLocaleString()}</span>}
        </div>
      </div>

      {/* ── Top: Charts (2-col) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* 資産推移 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">資産推移</span>
              <select
                value={chartMode}
                onChange={e => setChartMode(e.target.value)}
                className="text-xs px-2 py-1 rounded border border-input bg-background"
              >
                {modeOptions.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {latestCost > 0 && (
                <span className={cn('text-xs font-mono', latestGain >= 0 ? 'text-kagami-green' : 'text-kagami-red')}>
                  損益 {latestGain >= 0 ? '+' : ''}¥{latestGain.toLocaleString()} ({latestGain >= 0 ? '+' : ''}{gainPct}%)
                </span>
              )}
              <div className="flex gap-0.5">
                {[{ label: '3M', val: 3 }, { label: '6M', val: 6 }, { label: '1Y', val: 12 }, { label: 'ALL', val: 0 }].map(r => (
                  <button key={r.label} onClick={() => setRange(r.val)}
                    className={cn('px-2 py-0.5 rounded text-[10px] font-medium', range === r.val ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {historyData.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={historyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(2, 7).replace('-', '/')} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `¥${(Number(v) / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
                <Area type="monotone" dataKey="投資元本" stroke="#A8A29E" strokeWidth={1.5} strokeDasharray="6 3" fill="rgba(168,162,158,0.08)" />
                <Area type="monotone" dataKey="評価額" stroke="#1C1917" strokeWidth={2} fill="rgba(59,130,246,0.12)" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
              資産履歴データがありません
            </div>
          )}
        </div>

        {/* ポートフォリオ構成 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <span className="text-sm font-medium">ポートフォリオ構成</span>
          {portfolioItems.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={portfolioItems} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {portfolioItems.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `¥${Number(v).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {portfolioItems.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="font-mono">¥{compactYen(item.value)}</span>
                    <span className="text-muted-foreground w-10 text-right">{portfolioTotal > 0 ? ((item.value / portfolioTotal) * 100).toFixed(0) : 0}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">データなし</div>
          )}
        </div>
      </div>

      {/* ── Bottom: 3-column asset lists ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 現金・預金 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">💴 現金・預金</span>
            <button onClick={() => { setAddType('cash'); setShowAddForm(true) }} className="text-xs text-primary hover:underline">+ 追加</button>
          </div>
          {(assets ?? []).filter(a => a.asset_type === 'cash').map(a => (
            <div key={a.id} className="flex items-center justify-between py-1.5 group">
              <span className="text-sm">{a.name}</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono">¥{a.amount.toLocaleString()}</span>
                <button onClick={() => deleteAsset.mutate(a.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>

        {/* ファンド */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">📊 ファンド</span>
            <button onClick={() => { setAddType('fund'); setShowAddForm(true) }} className="text-xs text-primary hover:underline">+ 追加</button>
          </div>
          {(assets ?? []).filter(a => a.asset_type === 'fund').map(a => (
            <div key={a.id} className="flex items-center justify-between py-1.5 group">
              <span className="text-sm">{a.name}</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono">¥{a.amount.toLocaleString()}</span>
                <button onClick={() => deleteAsset.mutate(a.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          ))}
        </div>

        {/* 株式 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">📈 株式</span>
              {totalDivs > 0 && <span className="text-[10px] text-kagami-green font-mono">配当累計 ¥{totalDivs.toLocaleString()}</span>}
            </div>
            <button onClick={() => setShowAddStock(true)} className="text-xs text-primary hover:underline">+ 追加</button>
          </div>
          {(stocks ?? []).filter(s => s.status === 'active').map(st => {
            const value = st.shares * st.current_price
            const gain = value - st.cost_basis
            const gainPctStr = st.cost_basis > 0 ? ((gain / st.cost_basis) * 100).toFixed(1) : '—'
            return (
              <div key={st.id} className="py-1.5 border-b border-border/30 last:border-0 cursor-pointer hover:bg-muted/30 rounded -mx-1 px-1 transition-colors" onClick={() => openStockDetail(st)}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{st.name}</span>
                  <span className="text-sm font-mono">¥{value.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{st.ticker} · {st.shares}株</span>
                  <span className={cn('font-mono', gain >= 0 ? 'text-kagami-green' : 'text-kagami-red')}>
                    {gain >= 0 ? '+' : ''}{gainPctStr}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add Asset Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddForm(false)}>
          <div className="bg-card rounded-xl shadow-xl p-6 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif font-bold">資産を追加</h3>
            <div className="flex gap-1">
              {(['cash', 'fund', 'other'] as AssetType[]).map(t => (
                <button key={t} onClick={() => setAddType(t)} className={cn('px-3 py-1 rounded text-xs', addType === t ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                  {t === 'cash' ? '現金' : t === 'fund' ? 'ファンド' : 'その他'}
                </button>
              ))}
            </div>
            <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="名称" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" autoFocus />
            <input type="number" value={addAmount} onChange={e => setAddAmount(e.target.value)} placeholder="金額" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-muted-foreground">キャンセル</button>
              <button onClick={handleAdd} disabled={!addName || !addAmount} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-40">追加</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Detail Modal */}
      {selectedStock && (() => {
        const value = selectedStock.shares * selectedStock.current_price
        const gain = value - selectedStock.cost_basis
        const gainPct = selectedStock.cost_basis > 0 ? ((gain / selectedStock.cost_basis) * 100).toFixed(1) : '—'
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectedStock(null)}>
            <div className="bg-card rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="sticky top-0 bg-card rounded-t-xl border-b border-border p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-serif font-bold">{selectedStock.name}</h3>
                  <span className="text-xs text-muted-foreground">{selectedStock.ticker} · {selectedStock.exchange || '—'}</span>
                </div>
                <button onClick={() => setSelectedStock(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>

              <div className="p-4 space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">評価額</span>
                    <div className="font-mono font-bold">¥{value.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">損益</span>
                    <div className={cn('font-mono font-bold', gain >= 0 ? 'text-kagami-green' : 'text-kagami-red')}>
                      {gain >= 0 ? '+' : ''}¥{gain.toLocaleString()} ({gain >= 0 ? '+' : ''}{gainPct}%)
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">現在値</span>
                    <div className="font-mono">¥{selectedStock.current_price.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">取得日</span>
                    <div className="font-mono">{selectedStock.acquired_date}</div>
                  </div>
                </div>

                {/* Edit shares / cost basis */}
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <span className="text-xs font-medium">保有数・取得原価を編集</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">保有株数</label>
                      <input type="number" value={editShares} onChange={e => setEditShares(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm font-mono" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">取得原価（円）</label>
                      <input type="number" value={editCostBasis} onChange={e => setEditCostBasis(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm font-mono" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={handleUpdateStock} disabled={updateStock.isPending}
                      className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs disabled:opacity-40">
                      {updateStock.isPending ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>

                {/* Dividend section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">配当履歴</span>
                      {stockDivTotal > 0 && <span className="text-[10px] text-kagami-green font-mono">累計 ¥{stockDivTotal.toLocaleString()}</span>}
                    </div>
                    <button onClick={() => setShowDivForm(!showDivForm)} className="text-xs text-primary hover:underline">
                      {showDivForm ? 'キャンセル' : '+ 配当を追加'}
                    </button>
                  </div>

                  {/* Add dividend form */}
                  {showDivForm && (
                    <div className="border border-border rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground">金額（円）</label>
                          <input type="number" value={divAmount} onChange={e => setDivAmount(e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm font-mono" autoFocus />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">受取日</label>
                          <input type="date" value={divDate} onChange={e => setDivDate(e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm" />
                        </div>
                      </div>
                      <input value={divNote} onChange={e => setDivNote(e.target.value)} placeholder="メモ（任意）"
                        className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm" />
                      <div className="flex justify-end">
                        <button onClick={handleAddDividend} disabled={!divAmount || addDividend.isPending}
                          className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs disabled:opacity-40">
                          {addDividend.isPending ? '追加中...' : '追加'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Dividend list */}
                  {stockDividends.length > 0 ? (
                    <div className="space-y-0.5">
                      {stockDividends.map(d => (
                        <div key={d.id} className="flex items-center justify-between py-1.5 group text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">{d.received_date}</span>
                            {d.note && <span className="text-xs text-muted-foreground">{d.note}</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-kagami-green">+¥{d.amount.toLocaleString()}</span>
                            <button onClick={() => deleteDividend.mutate(d.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-2">配当記録はまだありません</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Add Stock Modal */}
      {showAddStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddStock(false)}>
          <div className="bg-card rounded-xl shadow-xl p-6 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif font-bold">株式を追加</h3>
            <input value={newTicker} onChange={e => setNewTicker(e.target.value)} placeholder="ティッカー（例: 7203.T）"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" autoFocus />
            <input value={newStockName} onChange={e => setNewStockName(e.target.value)} placeholder="銘柄名"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={newShares} onChange={e => setNewShares(e.target.value)} placeholder="株数"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
              <input type="number" value={newCostBasis} onChange={e => setNewCostBasis(e.target.value)} placeholder="取得原価（円）"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            </div>
            <input type="number" value={newCurrentPrice} onChange={e => setNewCurrentPrice(e.target.value)} placeholder="現在株価（任意）"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddStock(false)} className="px-4 py-2 text-sm text-muted-foreground">キャンセル</button>
              <button onClick={handleAddStock} disabled={!newTicker || !newStockName || !newShares || createStock.isPending}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-40">
                {createStock.isPending ? '追加中...' : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

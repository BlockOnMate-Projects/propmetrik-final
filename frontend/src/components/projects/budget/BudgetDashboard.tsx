'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Lock,
  Unlock,
  Bell,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  BarChart3,
  PieChart,
  LineChart,
  Calendar,
  Target,
  Activity,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  budgetApi,
  alertApi,
  rateLockApi,
  type BudgetAnalytics,
  type BudgetAlert,
  type ExchangeRateLock,
} from '@/lib/budget-api'
import { formatCurrency } from '@/lib/utils'

// =====================================================
// TYPES
// =====================================================

interface BudgetDashboardProps {
  projectId: string
  organizationId: string
  baseCurrency?: string
  className?: string
}

// =====================================================
// CONSTANTS
// =====================================================

const CURRENCIES = ['GHS', 'USD', 'GBP', 'EUR', 'NGN', 'ZAR']

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
}

const SEVERITY_ICONS: Record<string, React.ElementType> = {
  info: Bell,
  warning: AlertTriangle,
  critical: AlertTriangle,
}

// =====================================================
// CURRENCY DISPLAY CARD
// =====================================================

function CurrencyCard({
  currency,
  totalBudget,
  totalSpent,
  remaining,
  rate,
  isBaseCurrency,
  isLocked,
}: {
  currency: string
  totalBudget: number
  totalSpent: number
  remaining: number
  rate: number
  isBaseCurrency: boolean
  isLocked: boolean
}) {
  const spentPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
  const isOverBudget = remaining < 0

  return (
    <Card className={cn(
      'relative overflow-hidden',
      isBaseCurrency && 'ring-2 ring-amber-500'
    )}>
      {isLocked && (
        <div className="absolute right-2 top-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Lock className="h-4 w-4 text-amber-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Exchange rate locked</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="font-bold">{currency}</span>
          {isBaseCurrency && (
            <Badge variant="outline" className="text-xs">Base</Badge>
          )}
        </CardTitle>
        {!isBaseCurrency && (
          <CardDescription className="text-xs">
            Rate: {rate.toFixed(4)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Budget</span>
            <span className="font-medium">{formatCurrency(totalBudget, currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Spent</span>
            <span className="font-medium">{formatCurrency(totalSpent, currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Remaining</span>
            <span className={cn(
              'font-medium',
              isOverBudget ? 'text-red-600' : 'text-green-600'
            )}>
              {formatCurrency(Math.abs(remaining), currency)}
              {isOverBudget && ' over'}
            </span>
          </div>
        </div>
        <Progress
          value={Math.min(spentPercent, 100)}
          className={cn(
            'h-2',
            spentPercent > 90 ? 'bg-red-100' : spentPercent > 75 ? 'bg-yellow-100' : 'bg-muted'
          )}
        />
        <p className="text-center text-xs text-muted-foreground">
          {spentPercent.toFixed(1)}% utilized
        </p>
      </CardContent>
    </Card>
  )
}

// =====================================================
// VARIANCE ITEM
// =====================================================

function VarianceItem({
  label,
  budgeted,
  actual,
  variance,
  variancePercent,
}: {
  label: string
  budgeted: number
  actual: number
  variance: number
  variancePercent: number
}) {
  const isOverBudget = variance > 0

  return (
    <div className="flex items-center justify-between border-b py-3 last:border-0">
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          Budget: {formatCurrency(budgeted, 'GHS')} | Actual: {formatCurrency(actual, 'GHS')}
        </p>
      </div>
      <div className={cn(
        'flex items-center gap-1 rounded-md px-2 py-1',
        isOverBudget ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
      )}>
        {isOverBudget ? (
          <ArrowUpRight className="h-4 w-4" />
        ) : (
          <ArrowDownRight className="h-4 w-4" />
        )}
        <span className="text-sm font-medium">
          {Math.abs(variancePercent).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

// =====================================================
// ALERT ITEM
// =====================================================

function AlertItem({
  alert,
  onAcknowledge,
}: {
  alert: BudgetAlert
  onAcknowledge: (id: string) => void
}) {
  const Icon = SEVERITY_ICONS[alert.severity]

  return (
    <div className={cn(
      'flex items-start gap-3 rounded-lg border p-3',
      SEVERITY_COLORS[alert.severity]
    )}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{alert.title}</p>
        <p className="text-sm opacity-80">{alert.message}</p>
        <p className="mt-1 text-xs opacity-60">
          Threshold: {alert.thresholdValue}% | Current: {alert.currentValue.toFixed(1)}%
        </p>
      </div>
      {!alert.acknowledgedAt && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAcknowledge(alert.id)}
        >
          <CheckCircle className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

// =====================================================
// FORECAST CARD
// =====================================================

function ForecastCard({ forecast }: { forecast: BudgetAnalytics['forecast'] }) {
  const overrunPercent = forecast.forecastedTotalCost > 0
    ? (forecast.forecastedOverrun / forecast.forecastedTotalCost) * 100
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          AI Budget Forecast
        </CardTitle>
        <CardDescription>
          Confidence: {(forecast.confidenceLevel * 100).toFixed(0)}%
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Forecasted Total</p>
            <p className="text-xl font-bold">
              {formatCurrency(forecast.forecastedTotalCost, 'GHS')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Forecasted Overrun</p>
            <p className={cn(
              'text-xl font-bold',
              forecast.forecastedOverrun > 0 ? 'text-red-600' : 'text-green-600'
            )}>
              {formatCurrency(Math.abs(forecast.forecastedOverrun), 'GHS')}
            </p>
          </div>
        </div>

        {forecast.costDrivers.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Cost Drivers</p>
            <div className="space-y-2">
              {forecast.costDrivers.slice(0, 3).map((driver, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span>{driver.factor}</span>
                  <Badge variant={driver.impact > 0 ? 'destructive' : 'secondary'}>
                    {driver.impact > 0 ? '+' : ''}{driver.impact.toFixed(1)}%
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {forecast.recommendations.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Recommendations</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {forecast.recommendations.slice(0, 3).map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// =====================================================
// RATE LOCK CARD
// =====================================================

function RateLockCard({
  lock,
  onRelease,
}: {
  lock: ExchangeRateLock
  onRelease: (id: string) => void
}) {
  const daysRemaining = Math.ceil(
    (new Date(lock.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const isExpiringSoon = daysRemaining <= 7

  return (
    <Card className={cn(
      isExpiringSoon && 'border-yellow-300 bg-yellow-50'
    )}>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-amber-500" />
          <div>
            <p className="font-medium">
              {lock.fromCurrency} → {lock.toCurrency}
            </p>
            <p className="text-sm text-muted-foreground">
              Rate: {lock.lockedRate.toFixed(4)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <Badge variant={isExpiringSoon ? 'destructive' : 'secondary'}>
            {daysRemaining} days left
          </Badge>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatCurrency(lock.budgetAmountLocked, lock.fromCurrency)} locked
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRelease(lock.id)}
        >
          <Unlock className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

// =====================================================
// MAIN COMPONENT
// =====================================================

export function BudgetDashboard({
  projectId,
  organizationId,
  baseCurrency = 'GHS',
  className,
}: BudgetDashboardProps) {
  const [analytics, setAnalytics] = useState<BudgetAnalytics | null>(null)
  const [alerts, setAlerts] = useState<BudgetAlert[]>([])
  const [rateLocks, setRateLocks] = useState<ExchangeRateLock[]>([])
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(['USD', 'GBP', 'EUR'])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const [analyticsData, alertsData, locksData] = await Promise.all([
        budgetApi.getAnalytics(projectId, selectedCurrencies),
        alertApi.getAlerts(projectId),
        rateLockApi.getActive(projectId),
      ])

      setAnalytics(analyticsData)
      setAlerts(alertsData)
      setRateLocks(locksData)
    } catch (err) {
      console.error('Error fetching budget data:', err)
      setError('Failed to load budget data')
    } finally {
      setIsLoading(false)
    }
  }, [projectId, selectedCurrencies])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Acknowledge alert
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await alertApi.acknowledge(alertId)
      setAlerts(prev => prev.map(a => 
        a.id === alertId 
          ? { ...a, acknowledgedAt: new Date() }
          : a
      ))
    } catch (err) {
      console.error('Error acknowledging alert:', err)
    }
  }

  // Release rate lock
  const handleReleaseRateLock = async (lockId: string) => {
    try {
      await rateLockApi.release(lockId)
      setRateLocks(prev => prev.filter(l => l.id !== lockId))
    } catch (err) {
      console.error('Error releasing rate lock:', err)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
        <p className="mt-2 text-red-600">{error}</p>
        <Button onClick={fetchData} className="mt-4">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  if (!analytics) return null

  const activeAlerts = alerts.filter(a => !a.acknowledgedAt)
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical')

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Budget Overview</h2>
          <p className="text-muted-foreground">
            Multi-currency tracking with AI-powered forecasting
          </p>
        </div>
        <div className="flex items-center gap-2">
          {criticalAlerts.length > 0 && (
            <Badge variant="destructive" className="animate-pulse">
              {criticalAlerts.length} Critical Alert{criticalAlerts.length > 1 ? 's' : ''}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.multiCurrency.totalBudget, baseCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">
              Base currency: {baseCurrency}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(analytics.multiCurrency.totalSpent, baseCurrency)}
            </div>
            <Progress
              value={(analytics.multiCurrency.totalSpent / analytics.multiCurrency.totalBudget) * 100}
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Variance</CardTitle>
            {analytics.variance.variance > 0 ? (
              <TrendingUp className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn(
              'text-2xl font-bold',
              analytics.variance.variance > 0 ? 'text-red-600' : 'text-green-600'
            )}>
              {analytics.variance.variance > 0 ? '+' : ''}
              {analytics.variance.variancePercent.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(Math.abs(analytics.variance.variance), baseCurrency)}
              {analytics.variance.variance > 0 ? ' over' : ' under'} budget
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">FX Impact</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={cn(
              'text-2xl font-bold',
              analytics.variance.fxImpact > 0 ? 'text-red-600' : 'text-green-600'
            )}>
              {analytics.variance.fxImpact > 0 ? '+' : ''}
              {formatCurrency(analytics.variance.fxImpact, baseCurrency)}
            </div>
            <p className="text-xs text-muted-foreground">
              Exchange rate impact
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="currencies" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Currencies
          </TabsTrigger>
          <TabsTrigger value="variance" className="flex items-center gap-2">
            <LineChart className="h-4 w-4" />
            Variance
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alerts
            {activeAlerts.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="locks" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Rate Locks
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ForecastCard forecast={analytics.forecast} />
            
            <Card>
              <CardHeader>
                <CardTitle>Budget by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.variance.byCategory.map((cat) => (
                    <VarianceItem
                      key={cat.category}
                      label={cat.category}
                      budgeted={cat.budgeted}
                      actual={cat.actual}
                      variance={cat.variance}
                      variancePercent={cat.variancePercent}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Currencies Tab */}
        <TabsContent value="currencies" className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show currencies:</span>
            <Select
              value={selectedCurrencies.join(',')}
              onValueChange={(value) => setSelectedCurrencies(value.split(','))}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.filter(c => c !== baseCurrency).map(currency => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <CurrencyCard
              currency={baseCurrency}
              totalBudget={analytics.multiCurrency.totalBudget}
              totalSpent={analytics.multiCurrency.totalSpent}
              remaining={analytics.multiCurrency.remaining}
              rate={1}
              isBaseCurrency={true}
              isLocked={false}
            />
            {Object.entries(analytics.multiCurrency.conversions).map(([currency, data]) => (
              <CurrencyCard
                key={currency}
                currency={currency}
                totalBudget={data.totalBudget}
                totalSpent={data.totalSpent}
                remaining={data.remaining}
                rate={data.rate}
                isBaseCurrency={false}
                isLocked={analytics.multiCurrency.lockedRates.some(
                  l => l.currency === currency
                )}
              />
            ))}
          </div>
        </TabsContent>

        {/* Variance Tab */}
        <TabsContent value="variance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Variance by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.variance.byCategory.map((cat) => (
                    <VarianceItem
                      key={cat.category}
                      label={cat.category}
                      budgeted={cat.budgeted}
                      actual={cat.actual}
                      variance={cat.variance}
                      variancePercent={cat.variancePercent}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Variance by Phase</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analytics.variance.byPhase.map((phase) => (
                    <div key={phase.phaseName} className="space-y-1 border-b py-3 last:border-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{phase.phaseName}</span>
                        <Badge variant={phase.variance > 0 ? 'destructive' : 'secondary'}>
                          {phase.variance > 0 ? '+' : ''}
                          {((phase.variance / phase.budgeted) * 100).toFixed(1)}%
                        </Badge>
                      </div>
                      <Progress value={phase.percentComplete} className="h-2" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{phase.percentComplete.toFixed(0)}% complete</span>
                        <span>
                          {formatCurrency(phase.actual, baseCurrency)} / {formatCurrency(phase.budgeted, baseCurrency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          {activeAlerts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p className="mt-2 font-medium">No Active Alerts</p>
                <p className="text-sm text-muted-foreground">
                  All budget thresholds are within acceptable limits
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeAlerts.map(alert => (
                <AlertItem
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={handleAcknowledgeAlert}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Rate Locks Tab */}
        <TabsContent value="locks" className="space-y-4">
          {rateLocks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Unlock className="h-12 w-12 text-muted-foreground" />
                <p className="mt-2 font-medium">No Active Rate Locks</p>
                <p className="text-sm text-muted-foreground">
                  Lock exchange rates to protect your budget from currency fluctuations
                </p>
                <Button className="mt-4">
                  <Lock className="mr-2 h-4 w-4" />
                  Lock a Rate
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {rateLocks.map(lock => (
                <RateLockCard
                  key={lock.id}
                  lock={lock}
                  onRelease={handleReleaseRateLock}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default BudgetDashboard

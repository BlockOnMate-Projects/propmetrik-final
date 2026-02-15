import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MobileDashboard, BottomNavigation, OfflineIndicator } from '../MobileDashboard'

// Mock the hooks
jest.mock('@/hooks/useServiceWorker', () => ({
  useOnlineStatus: jest.fn(() => true),
}))

jest.mock('@/hooks/useOfflineSync', () => ({
  useOfflineSync: jest.fn(() => ({
    pendingCount: 0,
    sync: jest.fn(),
    isSyncing: false,
    lastSyncAt: null,
    isOnline: true,
    pendingExpenses: [],
    pendingDailyLogs: [],
    storageUsage: { used: 0, available: 0, percent: 0 },
    syncError: null,
    clearCache: jest.fn(),
    refreshPending: jest.fn(),
  })),
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}))

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ projects: [], notifications: [] }),
  })
) as jest.Mock

describe('MobileDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Helper to render with act wrapper for async effects
  const renderWithAct = async (component: React.ReactElement) => {
    let result: ReturnType<typeof render>
    await act(async () => {
      result = render(component)
    })
    // Wait for effects to settle
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    return result!
  }

  it('renders the dashboard header', async () => {
    await renderWithAct(<MobileDashboard />)
    expect(screen.getByText('PROPMETRIK')).toBeInTheDocument()
    expect(screen.getByText('Construction Management')).toBeInTheDocument()
  })

  it('displays quick action buttons', async () => {
    await renderWithAct(<MobileDashboard />)
    expect(screen.getByText('Log Expense')).toBeInTheDocument()
    expect(screen.getByText('Daily Log')).toBeInTheDocument()
    // Projects appears multiple times (quick action + bottom nav), use getAllByText
    expect(screen.getAllByText('Projects').length).toBeGreaterThanOrEqual(1)
  })

  it('shows online status indicator', async () => {
    await renderWithAct(<MobileDashboard />)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('displays active projects section', async () => {
    await renderWithAct(<MobileDashboard />)
    expect(screen.getByText('Active Projects')).toBeInTheDocument()
  })

  it('shows this week stats section', async () => {
    await renderWithAct(<MobileDashboard />)
    expect(screen.getByText('This Week')).toBeInTheDocument()
  })

  it('fetches data on mount', async () => {
    await renderWithAct(<MobileDashboard />)
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/projects?limit=5&status=active')
      expect(global.fetch).toHaveBeenCalledWith('/api/notifications?unread=true&limit=5')
    })
  })
})

describe('MobileDashboard with offline state', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { useOnlineStatus } = require('@/hooks/useServiceWorker')
    useOnlineStatus.mockReturnValue(false)
  })

  it('shows offline indicator when offline', () => {
    render(<MobileDashboard />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })
})

describe('MobileDashboard with pending sync items', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { useOfflineSync } = require('@/hooks/useOfflineSync')
    useOfflineSync.mockReturnValue({
      pendingCount: 5,
      sync: jest.fn(),
      isSyncing: false,
      lastSyncAt: null,
      isOnline: true,
      pendingExpenses: [],
      pendingDailyLogs: [],
      storageUsage: { used: 0, available: 0, percent: 0 },
      syncError: null,
      clearCache: jest.fn(),
      refreshPending: jest.fn(),
    })
  })

  it('shows pending sync count', () => {
    render(<MobileDashboard />)
    expect(screen.getByText('5 pending')).toBeInTheDocument()
  })

  it('shows offline pending section', () => {
    render(<MobileDashboard />)
    expect(screen.getByText('5 items pending sync')).toBeInTheDocument()
  })
})

describe('BottomNavigation', () => {
  it('renders all navigation tabs', () => {
    render(<BottomNavigation />)
    
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Expense')).toBeInTheDocument()
    expect(screen.getByText('Logs')).toBeInTheDocument()
  })

  it('has correct navigation links', () => {
    render(<BottomNavigation />)
    
    const homeLink = screen.getByText('Home').closest('a')
    expect(homeLink).toHaveAttribute('href', '/mobile')
    
    const projectsLink = screen.getByText('Projects').closest('a')
    expect(projectsLink).toHaveAttribute('href', '/projects')
    
    const expenseLink = screen.getByText('Expense').closest('a')
    expect(expenseLink).toHaveAttribute('href', '/mobile/expense')
    
    const logsLink = screen.getByText('Logs').closest('a')
    expect(logsLink).toHaveAttribute('href', '/mobile/daily-log')
  })
})

describe('OfflineIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not render when online with no pending items', () => {
    const { useOnlineStatus } = require('@/hooks/useServiceWorker')
    const { useOfflineSync } = require('@/hooks/useOfflineSync')
    
    useOnlineStatus.mockReturnValue(true)
    useOfflineSync.mockReturnValue({
      pendingCount: 0,
      isSyncing: false,
    })

    const { container } = render(<OfflineIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('renders offline message when offline', () => {
    const { useOnlineStatus } = require('@/hooks/useServiceWorker')
    const { useOfflineSync } = require('@/hooks/useOfflineSync')
    
    useOnlineStatus.mockReturnValue(false)
    useOfflineSync.mockReturnValue({
      pendingCount: 0,
      isSyncing: false,
    })

    render(<OfflineIndicator />)
    expect(screen.getByText(/You're offline/i)).toBeInTheDocument()
  })

  it('shows syncing state', () => {
    const { useOnlineStatus } = require('@/hooks/useServiceWorker')
    const { useOfflineSync } = require('@/hooks/useOfflineSync')
    
    useOnlineStatus.mockReturnValue(true)
    useOfflineSync.mockReturnValue({
      pendingCount: 3,
      isSyncing: true,
    })

    render(<OfflineIndicator />)
    expect(screen.getByText('Syncing...')).toBeInTheDocument()
  })
})

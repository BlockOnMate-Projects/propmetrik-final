'use client'

import { Header, MetricCard } from '@/components/layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Trophy,
  MapPin,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Star,
  Building2,
  FileText,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contributionsApi, ContributionFilters } from '@/lib/api'
import { Contribution, ContributionType, ValidationStatus, ContributorProfile } from '@/types/data-hub'
import { formatRelativeTime, formatNumber, cn } from '@/lib/utils'
import { useState } from 'react'

const statusOptions: { value: ValidationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'needs_review', label: 'Needs Review' },
]

const typeOptions: { value: ContributionType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'property_listing', label: 'Property Listing' },
  { value: 'price_update', label: 'Price Update' },
  { value: 'property_correction', label: 'Property Correction' },
  { value: 'new_development', label: 'New Development' },
  { value: 'market_insight', label: 'Market Insight' },
  { value: 'photo_submission', label: 'Photo Submission' },
]

function ContributionReviewDialog({
  contribution,
  onApprove,
  onReject,
}: {
  contribution: Contribution
  onApprove: (id: string, credits?: number) => void
  onReject: (id: string, reason: string) => void
}) {
  const [rejectReason, setRejectReason] = useState('')
  const [credits, setCredits] = useState(10)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Contribution</DialogTitle>
          <DialogDescription>
            {contribution.contribution_type} • Submitted {formatRelativeTime(contribution.submitted_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contribution Details */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{contribution.contribution_type}</Badge>
              <Badge variant={
                contribution.validation_status === 'pending' ? 'warning' :
                contribution.validation_status === 'approved' ? 'success' :
                contribution.validation_status === 'rejected' ? 'destructive' : 'secondary'
              }>
                {contribution.validation_status}
              </Badge>
            </div>

            {contribution.property_region && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {contribution.property_region}
              </div>
            )}

            <div className="text-sm">
              <p className="font-medium mb-1">Submitted Data:</p>
              <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-48">
                {JSON.stringify(contribution.data, null, 2)}
              </pre>
            </div>

            {contribution.confidence_score !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Confidence Score:</span>
                <Badge variant={
                  contribution.confidence_score >= 0.8 ? 'success' :
                  contribution.confidence_score >= 0.5 ? 'warning' : 'destructive'
                }>
                  {(contribution.confidence_score * 100).toFixed(0)}%
                </Badge>
              </div>
            )}
          </div>

          {/* Actions */}
          {contribution.validation_status === 'pending' && (
            <DialogFooter className="flex gap-2">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-sm text-muted-foreground">Credits:</span>
                <input
                  type="number"
                  value={credits}
                  onChange={(e) => setCredits(parseInt(e.target.value) || 0)}
                  className="w-20 h-9 rounded-md border bg-background px-3 text-sm"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => onReject(contribution.id, rejectReason || 'Does not meet quality standards')}
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button onClick={() => onApprove(contribution.id, credits)}>
                <ThumbsUp className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function ContributionsPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<ContributionFilters>({
    page: 1,
    limit: 20,
  })
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [activeTab, setActiveTab] = useState('pending')

  const queryFilters: ContributionFilters = {
    ...filters,
    validation_status: activeTab === 'all'
      ? (selectedStatus !== 'all' ? (selectedStatus as ValidationStatus) : undefined)
      : activeTab === 'pending' ? 'pending' : undefined,
    contribution_type: selectedType !== 'all' ? (selectedType as ContributionType) : undefined,
  }

  const { data: contributions, isLoading } = useQuery({
    queryKey: ['contributions', queryFilters],
    queryFn: () => contributionsApi.getAll(queryFilters),
  })

  const { data: pendingCount } = useQuery({
    queryKey: ['pending-contributions-count'],
    queryFn: () => contributionsApi.getPending(1),
    select: (data) => data.count,
  })

  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['contributors-leaderboard'],
    queryFn: () => contributionsApi.getLeaderboard(10),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, credits }: { id: string; credits?: number }) =>
      contributionsApi.approve(id, credits),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributions'] })
      queryClient.invalidateQueries({ queryKey: ['pending-contributions'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      contributionsApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributions'] })
      queryClient.invalidateQueries({ queryKey: ['pending-contributions'] })
    },
  })

  const handleApprove = (id: string, credits?: number) => {
    approveMutation.mutate({ id, credits })
  }

  const handleReject = (id: string, reason: string) => {
    rejectMutation.mutate({ id, reason })
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Contributions" description="Review and manage user-submitted data" />

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Pending Review"
              value={pendingCount || 0}
              icon={Clock}
              color="yellow"
            />
            <MetricCard
              title="Approved Today"
              value="24"
              icon={CheckCircle}
              color="green"
            />
            <MetricCard
              title="Rejection Rate"
              value="8%"
              subtitle="Last 30 days"
              icon={XCircle}
              color="red"
            />
            <MetricCard
              title="Active Contributors"
              value={leaderboard?.data?.length || 0}
              icon={Users}
              color="blue"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="pending">
                      Pending
                      {pendingCount ? (
                        <Badge variant="secondary" className="ml-2">
                          {pendingCount}
                        </Badge>
                      ) : null}
                    </TabsTrigger>
                    <TabsTrigger value="all">All Contributions</TabsTrigger>
                  </TabsList>

                  {activeTab === 'all' && (
                    <div className="flex gap-2">
                      <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={selectedType} onValueChange={setSelectedType}>
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {typeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <TabsContent value="pending" className="mt-4">
                  <Card>
                    <CardContent className="p-0">
                      {isLoading ? (
                        <div className="p-4 space-y-4">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                              <Skeleton className="h-10 w-10 rounded-full" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-48" />
                              </div>
                              <Skeleton className="h-8 w-20" />
                            </div>
                          ))}
                        </div>
                      ) : contributions?.data?.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p className="text-lg font-medium">All caught up!</p>
                          <p className="text-sm">No pending contributions to review</p>
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Region</TableHead>
                              <TableHead>Confidence</TableHead>
                              <TableHead>Submitted</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {contributions?.data?.map((contribution) => (
                              <TableRow key={contribution.id}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {contribution.contribution_type === 'property_listing' && (
                                      <Building2 className="h-4 w-4 text-blue-400" />
                                    )}
                                    {contribution.contribution_type === 'price_update' && (
                                      <FileText className="h-4 w-4 text-green-400" />
                                    )}
                                    <span className="font-medium">
                                      {contribution.contribution_type.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {contribution.property_region || 'Unknown'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant={
                                    (contribution.confidence_score || 0) >= 0.8 ? 'success' :
                                    (contribution.confidence_score || 0) >= 0.5 ? 'warning' : 'destructive'
                                  }>
                                    {((contribution.confidence_score || 0) * 100).toFixed(0)}%
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm text-muted-foreground">
                                    {formatRelativeTime(contribution.submitted_at)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end gap-2">
                                    <ContributionReviewDialog
                                      contribution={contribution}
                                      onApprove={handleApprove}
                                      onReject={handleReject}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-green-400 hover:text-green-300"
                                      onClick={() => handleApprove(contribution.id, 10)}
                                    >
                                      <ThumbsUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-red-400 hover:text-red-300"
                                      onClick={() => handleReject(contribution.id, 'Does not meet quality standards')}
                                    >
                                      <ThumbsDown className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="all" className="mt-4">
                  <Card>
                    <CardContent className="p-0">
                      {/* Same table structure but showing all */}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Region</TableHead>
                            <TableHead>Submitted</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contributions?.data?.map((contribution) => (
                            <TableRow key={contribution.id}>
                              <TableCell>
                                <span className="font-medium">
                                  {contribution.contribution_type.replace(/_/g, ' ')}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  contribution.validation_status === 'approved' ? 'success' :
                                  contribution.validation_status === 'rejected' ? 'destructive' :
                                  contribution.validation_status === 'pending' ? 'warning' : 'secondary'
                                }>
                                  {contribution.validation_status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm text-muted-foreground">
                                  {contribution.property_region || 'Unknown'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm text-muted-foreground">
                                  {formatRelativeTime(contribution.submitted_at)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end">
                                  <ContributionReviewDialog
                                    contribution={contribution}
                                    onApprove={handleApprove}
                                    onReject={handleReject}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Leaderboard Sidebar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-400" />
                  Top Contributors
                </CardTitle>
              </CardHeader>
              <CardContent>
                {leaderboardLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {leaderboard?.data?.map((contributor, index) => (
                      <div
                        key={contributor.id}
                        className="flex items-center gap-3"
                      >
                        <div className={cn(
                          'h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold',
                          index === 0 && 'bg-yellow-500/20 text-yellow-400',
                          index === 1 && 'bg-gray-400/20 text-gray-300',
                          index === 2 && 'bg-orange-500/20 text-orange-400',
                          index > 2 && 'bg-muted text-muted-foreground'
                        )}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {contributor.display_name || 'Anonymous'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {contributor.total_contributions} contributions
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Star className="h-3 w-3 text-yellow-400" />
                          <span className="font-medium">
                            {formatNumber(contributor.total_credits)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

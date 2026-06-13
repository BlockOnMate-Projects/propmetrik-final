"use client";

/**
 * E-Sign Dashboard - Full-featured main page
 *
 * Shows stats cards, envelope list with status filters, recent activity,
 * and quick actions (new envelope, templates).
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  PenTool,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Loader2,
  FileSignature,
  Search,
  Send,
  MoreHorizontal,
  Download,
  RotateCcw,
  Ban,
  LayoutTemplate,
  Activity,
  RefreshCw,
  Eye,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getEnvelopes,
  getReportStats,
  getReportActivity,
  voidEnvelope,
  resendEnvelope,
  downloadEnvelopeDocument,
} from "@/lib/esign-api";
import type { Envelope, ESignStats, AuditEntry } from "@/lib/esign-types";

export default function ESignDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [stats, setStats] = useState<ESignStats>({ total: 0, pending: 0, completed: 0, voided: 0, declined: 0 });
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const created = searchParams.get("created");

  const fetchData = useCallback(async () => {
    try {
      const [envData, statsData, activityData] = await Promise.allSettled([
        getEnvelopes({ limit: 50 }),
        getReportStats(30).catch(() => null),
        getReportActivity(10).catch(() => null),
      ]);

      if (envData.status === "fulfilled") {
        const data = envData.value;
        const envList: Envelope[] = Array.isArray(data) ? data : (data?.data || data?.envelopes || []);
        setEnvelopes(envList);

        if (statsData.status === "fulfilled" && statsData.value) {
          setStats(statsData.value);
        } else {
          setStats({
            total: envList.length,
            pending: envList.filter((e) => e.status === "sent" || e.status === "delivered" || e.status === "pending" || e.status === "draft").length,
            completed: envList.filter((e) => e.status === "completed").length,
            voided: envList.filter((e) => e.status === "voided").length,
            declined: envList.filter((e) => e.status === "declined").length,
          });
        }
      }

      if (activityData.status === "fulfilled" && activityData.value) {
        setActivity(activityData.value.activity || activityData.value || []);
      }
    } catch (err) {
      console.error("Failed to fetch e-sign data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = () => { setRefreshing(true); fetchData(); };

  const handleVoid = async (id: string) => {
    if (!confirm("Void this envelope? This cannot be undone.")) return;
    try { await voidEnvelope(id); fetchData(); } catch (err: any) { alert(err.message); }
  };

  const handleResend = async (id: string) => {
    try { await resendEnvelope(id); alert("Resent successfully"); } catch (err: any) { alert(err.message); }
  };

  const handleDownload = async (id: string) => {
    try {
      const blob = await downloadEnvelopeDocument(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `envelope_${id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { alert(err.message); }
  };

  const filteredEnvelopes = envelopes
    .filter((e) => {
      if (activeTab === "all") return true;
      if (activeTab === "pending") return e.status === "sent" || e.status === "delivered" || e.status === "pending" || e.status === "draft";
      if (activeTab === "completed") return e.status === "completed";
      if (activeTab === "voided") return e.status === "voided" || e.status === "declined";
      return true;
    })
    .filter((e) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return e.name?.toLowerCase().includes(s) || e.context_entity_name?.toLowerCase().includes(s) || e.id?.toLowerCase().includes(s);
    });

  const getStatusBadge = (status: string) => {
    const map: Record<string, { cls: string; label: string }> = {
      completed: { cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", label: "Completed" },
      signed: { cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", label: "Signed" },
      sent: { cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Sent" },
      delivered: { cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", label: "Delivered" },
      pending: { cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Pending" },
      in_progress: { cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", label: "In Progress" },
      draft: { cls: "bg-muted text-gray-800", label: "Draft" },
      voided: { cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", label: "Voided" },
      declined: { cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", label: "Declined" },
      expired: { cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", label: "Expired" },
    };
    const s = map[status] || { cls: "bg-muted text-gray-800", label: status };
    return <Badge className={s.cls}>{s.label}</Badge>;
  };

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { month: "short", day: "numeric", year: "numeric" }) : "—";

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileSignature className="h-6 w-6 text-primary" /> E-Signature
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage document signing across all workflows</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/e-sign/templates"><LayoutTemplate className="h-4 w-4 mr-1" /> Templates</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/e-sign/new"><Plus className="h-4 w-4 mr-1" /> New Envelope</Link>
          </Button>
        </div>
      </div>

      {created && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-sm text-green-800 dark:text-green-300">Envelope created and sent successfully!</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, icon: FileText, color: "", tab: "all" },
          { label: "Pending", value: stats.pending, icon: Clock, color: "text-yellow-600", tab: "pending" },
          { label: "Completed", value: stats.completed, icon: CheckCircle, color: "text-green-600", tab: "completed" },
          { label: "Voided", value: (stats.voided || 0) + (stats.declined || 0), icon: XCircle, color: "text-red-600", tab: "voided" },
        ].map((s) => (
          <Card key={s.tab} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveTab(s.tab)}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
                <s.icon className="h-8 w-8 opacity-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-lg">Envelopes</CardTitle>
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4 w-full sm:w-auto overflow-x-auto">
                  <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
                  <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
                  <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
                  <TabsTrigger value="voided">Voided</TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="mt-0">
                  {filteredEnvelopes.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No envelopes found</p>
                      {activeTab === "all" && !search && (
                        <Button variant="outline" size="sm" className="mt-3" asChild>
                          <Link href="/dashboard/e-sign/new"><Plus className="h-4 w-4 mr-1" /> Create first envelope</Link>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredEnvelopes.map((env) => (
                        <div key={env.id} className="flex items-center gap-4 py-3 px-1 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded transition-colors group">
                          <FileText className="h-9 w-9 text-primary/60 p-1.5 bg-primary/5 rounded shrink-0" />
                          <div className="flex-1 min-w-0">
                            <Link href={`/dashboard/e-sign/${env.id}`} className="font-medium text-sm hover:underline block truncate">
                              {env.name || `Envelope ${env.id.slice(0, 8)}`}
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                              {getStatusBadge(env.status)}
                              {env.context_type && (
                                <span className="text-[10px] text-muted-foreground">{env.context_type}: {env.context_entity_name}</span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{fmtDate(env.created_at || env.createdAt || "")}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/dashboard/e-sign/${env.id}`)}>
                                <Eye className="h-4 w-4 mr-2" /> View
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDownload(env.id)}>
                                <Download className="h-4 w-4 mr-2" /> Download
                              </DropdownMenuItem>
                              {(env.status === "pending" || env.status === "in_progress") && (
                                <>
                                  <DropdownMenuItem onClick={() => handleResend(env.id)}>
                                    <RotateCcw className="h-4 w-4 mr-2" /> Resend
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleVoid(env.id)} className="text-destructive">
                                    <Ban className="h-4 w-4 mr-2" /> Void
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start text-sm h-9" asChild>
                <Link href="/dashboard/e-sign/new"><Send className="h-4 w-4 mr-2" /> Send for Signature</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm h-9" asChild>
                <Link href="/dashboard/e-sign/new?mode=self"><PenTool className="h-4 w-4 mr-2" /> Self-Sign</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm h-9" asChild>
                <Link href="/dashboard/e-sign/templates"><LayoutTemplate className="h-4 w-4 mr-2" /> Templates</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5"><Activity className="h-4 w-4" /> Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
              ) : (
                <div className="space-y-3">
                  {activity.slice(0, 8).map((a, i) => (
                    <div key={a.id || i} className="flex gap-2 text-xs">
                      <div className="shrink-0 mt-0.5">
                        {a.action?.includes("sign") ? <PenTool className="h-3.5 w-3.5 text-green-500" /> :
                         a.action?.includes("void") || a.action?.includes("decline") ? <XCircle className="h-3.5 w-3.5 text-red-500" /> :
                         <Send className="h-3.5 w-3.5 text-blue-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p><span className="font-medium">{a.actor_name || "System"}</span> {a.action?.replace(/_/g, " ")}</p>
                        <p className="text-muted-foreground">{fmtDate(a.created_at || a.createdAt || "")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

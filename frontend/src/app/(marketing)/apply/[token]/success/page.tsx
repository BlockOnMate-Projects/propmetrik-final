import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Building2, Clock, FileText } from 'lucide-react';

export default async function ApplySuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ id?: string; token?: string }>;
}) {
  const { token: routeToken } = await params;
  const sp = await searchParams;
  // The apply form redirects here with the application id + tracking token in the query.
  // Prefer those for the status link; the route param is the property/link token (not an application).
  const id = sp.token || sp.id || routeToken;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="text-center py-10">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your application has been received and is being reviewed. You&apos;ll receive an email notification when there&apos;s an update.
          </p>

          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left space-y-3">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Estimated Review Time</p>
                <p className="text-sm font-medium text-gray-900">2-5 business days</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Tracking Token</p>
                <p className="text-sm font-medium text-gray-900 font-mono">{id}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Link href={`/application/${id}/status`} className="block">
              <Button className="w-full bg-cyan-600 hover:bg-cyan-700">
                Check Application Status
              </Button>
            </Link>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-center gap-2 text-gray-400">
              <Building2 className="w-4 h-4" />
              <span className="text-xs">Propmetrik Tenant Portal</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

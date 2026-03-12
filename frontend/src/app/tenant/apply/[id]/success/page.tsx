import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ id?: string; token?: string }> }) {
  const sp = await searchParams;
  const applicationId = sp.id;
  const trackingToken = sp.token || applicationId; // Fallback to ID if no token

  return (
    <div className="container flex items-center justify-center min-h-screen py-10">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Application Submitted!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Thank you for applying. We have received your application and it is currently under review.
          </p>
          {applicationId && (
             <p className="text-sm bg-muted p-2 rounded">
                Application Reference: <span className="font-mono font-medium">{applicationId.substring(0, 8)}...</span>
             </p>
          )}
          <p className="text-sm text-muted-foreground mt-4">
             You will receive an email shortly with a link to track your application status.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
            <Button asChild>
                <Link href={`/application/${trackingToken}/status`}>
                    Track Status
                </Link>
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

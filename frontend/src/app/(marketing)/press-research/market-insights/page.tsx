import { redirect } from 'next/navigation';

export default function MarketInsightsRedirect() {
  redirect('/insights/latest');
}

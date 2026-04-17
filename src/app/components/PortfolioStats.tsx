import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react';

interface Holding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  purchasePrice: number;
  currentPrice: number;
  dividendYield: number;
  currency?: string;
  valueNOK?: number | null;
}

interface PortfolioStatsProps {
  holdings: Holding[];
}

export function PortfolioStats({ holdings }: PortfolioStatsProps) {
  const allPurchaseInNOK = holdings.every((h) => (h.currency || 'NOK') === 'NOK');
  const allPricesNOK = holdings.every((h) => (h.currency || 'NOK') === 'NOK');
  const totalInvested = holdings.reduce((sum, holding) => {
    const ccy = holding.currency || 'NOK';
    if (ccy !== 'NOK') return sum;
    return sum + holding.shares * holding.purchasePrice;
  }, 0);

  const currentValue = holdings.reduce(
    (sum, holding) => {
      if (typeof holding.valueNOK === 'number') return sum + holding.valueNOK;
      const ccy = holding.currency || 'NOK';
      if (ccy === 'NOK') return sum + holding.shares * holding.currentPrice;
      return sum;
    },
    0
  );

  const totalGainLoss = allPurchaseInNOK ? currentValue - totalInvested : NaN;
  const totalGainLossPercent =
    allPurchaseInNOK && totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;

  const annualDividends = allPricesNOK
    ? holdings.reduce(
        (sum, holding) => sum + (holding.shares * holding.currentPrice * holding.dividendYield) / 100,
        0
      )
    : NaN;

  const formatNOK = (amount: number) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
    }).format(amount);
  };

  const stats = [
    {
      title: 'Total Value',
      value: formatNOK(currentValue),
      icon: DollarSign,
      color: 'text-blue-600',
    },
    {
      title: 'Total Invested',
      value: allPurchaseInNOK ? formatNOK(totalInvested) : '—',
      subValue: allPurchaseInNOK ? undefined : 'Mixed purchase currencies (NOK sum not shown)',
      icon: PieChart,
      color: 'text-purple-600',
    },
    {
      title: 'Total Gain/Loss',
      value: allPurchaseInNOK ? formatNOK(totalGainLoss) : '—',
      subValue: allPurchaseInNOK
        ? `${totalGainLossPercent >= 0 ? '+' : ''}${totalGainLossPercent.toFixed(2)}%`
        : 'Needs all purchase prices in NOK to compare to total value',
      icon: allPurchaseInNOK ? (totalGainLoss >= 0 ? TrendingUp : TrendingDown) : TrendingUp,
      color: allPurchaseInNOK ? (totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600') : 'text-muted-foreground',
    },
    {
      title: 'Annual Dividends',
      value: allPricesNOK ? formatNOK(annualDividends) : '—',
      subValue: allPricesNOK ? undefined : 'Estimates need prices in NOK (or convert manually)',
      icon: DollarSign,
      color: 'text-emerald-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            {stat.subValue && (
              <p className={`text-xs ${stat.color} mt-1`}>{stat.subValue}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Trash2, TrendingUp, TrendingDown } from 'lucide-react';

interface Holding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  purchasePrice: number;
  currentPrice: number;
  dividendYield: number;
}

interface HoldingsListProps {
  holdings: Holding[];
  onDelete: (id: string) => void;
}

export function HoldingsList({ holdings, onDelete }: HoldingsListProps) {
  const formatNOK = (amount: number) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
    }).format(amount);
  };

  if (holdings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <p>No stocks in your portfolio yet.</p>
          <p className="text-sm mt-2">Add stocks manually or upload a screenshot to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {holdings.map((holding) => {
        const totalValue = holding.shares * holding.currentPrice;
        const totalCost = holding.shares * holding.purchasePrice;
        const gainLoss = totalValue - totalCost;
        const gainLossPercent = (gainLoss / totalCost) * 100;
        const isPositive = gainLoss >= 0;

        return (
          <Card key={holding.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{holding.symbol}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{holding.name}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(holding.id)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Shares</p>
                  <p className="font-semibold">{holding.shares}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Current Price</p>
                  <p className="font-semibold">{formatNOK(holding.currentPrice)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Purchase Price</p>
                  <p className="font-semibold">{formatNOK(holding.purchasePrice)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Value</p>
                  <p className="font-semibold">{formatNOK(totalValue)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  {isPositive ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                  <span className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {isPositive ? '+' : ''}{formatNOK(gainLoss)} ({isPositive ? '+' : ''}{gainLossPercent.toFixed(2)}%)
                  </span>
                </div>
                {holding.dividendYield > 0 && (
                  <span className="text-sm text-muted-foreground">
                    Div: {holding.dividendYield}%
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
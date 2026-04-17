import { useState, useEffect } from 'react';
import { AddStockDialog } from './components/AddStockDialog';
import { PortfolioStats } from './components/PortfolioStats';
import { HoldingsList } from './components/HoldingsList';
import { PortfolioChart } from './components/PortfolioChart';
import { ScreenshotUpload } from './components/ScreenshotUpload';
import { AIAdvisor } from './components/AIAdvisor';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { TrendingUp, Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './components/ui/alert-dialog';

interface Holding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  purchasePrice: number;
  currentPrice: number;
  dividendYield: number;
}

export default function App() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [extractedStocks, setExtractedStocks] = useState<any[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/portfolio`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setHoldings(data.data);
      } else {
        console.error('Failed to fetch portfolio:', data.error);
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
      toast.error('Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStock = async (stock: {
    symbol: string;
    name: string;
    shares: number;
    purchasePrice: number;
    dividendYield: number;
  }) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/portfolio`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(stock),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setHoldings([...holdings, data.data]);
        toast.success(`Added ${stock.symbol} to portfolio`);
      } else {
        throw new Error(data.error || 'Failed to add stock');
      }
    } catch (error) {
      console.error('Error adding stock:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add stock');
    }
  };

  const handleDeleteStock = async (id: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/portfolio/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setHoldings(holdings.filter((h) => h.id !== id));
        toast.success('Stock removed from portfolio');
      } else {
        throw new Error(data.error || 'Failed to delete stock');
      }
    } catch (error) {
      console.error('Error deleting stock:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete stock');
    }
  };

  const handleStocksExtracted = (stocks: any[]) => {
    setExtractedStocks(stocks);
    setShowImportDialog(true);
  };

  const handleImportStocks = async () => {
    try {
      for (const stock of extractedStocks) {
        await handleAddStock({
          symbol: stock.symbol,
          name: stock.name,
          shares: stock.shares,
          purchasePrice: stock.currentPrice, // Use current price as purchase price if not available
          dividendYield: stock.dividendYield || 0,
        });
      }
      setShowImportDialog(false);
      setExtractedStocks([]);
      // Refetch portfolio to get all stocks from backend
      await fetchPortfolio();
      toast.success(`Imported ${extractedStocks.length} stocks`);
    } catch (error) {
      console.error('Error importing stocks:', error);
      toast.error('Failed to import some stocks');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6" />
            <h1 className="text-xl font-bold">My Stock Portfolio</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-6">
        {/* Stats */}
        <PortfolioStats holdings={holdings} />

        {/* Chart */}
        {holdings.length > 0 && <PortfolioChart holdings={holdings} />}

        {/* Upload Screenshot */}
        <ScreenshotUpload
          onStocksExtracted={handleStocksExtracted}
          projectId={projectId}
          publicAnonKey={publicAnonKey}
        />

        {/* Add Stock Button */}
        <AddStockDialog onAddStock={handleAddStock} />

        {/* Holdings List */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Your Holdings</h2>
          <HoldingsList holdings={holdings} onDelete={handleDeleteStock} />
        </div>

        {/* AI Advisor */}
        <AIAdvisor
          holdings={holdings}
          projectId={projectId}
          publicAnonKey={publicAnonKey}
        />
      </main>

      {/* Import Dialog */}
      <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Extracted Stocks?</AlertDialogTitle>
            <AlertDialogDescription>
              We found {extractedStocks.length} stocks in your screenshot:
              <ul className="mt-2 space-y-1">
                {extractedStocks.map((stock, idx) => (
                  <li key={idx} className="text-sm font-medium text-foreground">
                    {stock.symbol} - {stock.shares} shares @ ${stock.currentPrice}
                  </li>
                ))}
              </ul>
              <p className="mt-2">Do you want to add these to your portfolio?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setExtractedStocks([])}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportStocks}>Import All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
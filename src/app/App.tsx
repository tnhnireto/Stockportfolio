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
  currency?: string;
  valueNOK?: number | null;
}

export default function App() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [extractedStocks, setExtractedStocks] = useState<any[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const normalizeSymbol = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    // Normalize symbols like "AKER BP" vs "AKERBP" vs "AKER-BP"
    // Also handles symbols with exchange suffixes like "AKERBP.OL".
    const trimmed = value.trim().toUpperCase();
    const base = trimmed.split(/[\/\s]/)[0];
    return base.replace(/[^A-Z0-9]/g, '');
  };

  const normalizeName = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  };

  const findExistingHolding = (symbolValue: unknown, nameValue?: unknown) => {
    const sym = normalizeSymbol(symbolValue);
    if (sym) {
      const exact = holdings.find((h) => normalizeSymbol(h.symbol) === sym);
      if (exact) return exact;

      // Fallback: tolerate common exchange suffixes (e.g. AKERBPOL) by prefix matching.
      // Only match when at least 4 chars to avoid accidental collisions.
      if (sym.length >= 4) {
        const byPrefix = holdings.find((h) => {
          const hs = normalizeSymbol(h.symbol);
          return (hs.startsWith(sym) || sym.startsWith(hs)) && Math.min(hs.length, sym.length) >= 4;
        });
        if (byPrefix) return byPrefix;
      }
    }

    const normName = normalizeName(nameValue);
    if (!normName) return undefined;

    const matches = holdings.filter((h) => normalizeName(h.name) === normName);
    if (matches.length === 0) return undefined;
    if (matches.length === 1) return matches[0];

    // If duplicates already exist, choose the best match by symbol similarity.
    // Prefer a holding whose normalized symbol is contained in the extracted symbol (or vice versa).
    if (sym) {
      const bySymbolSimilarity = matches.find((h) => {
        const hs = normalizeSymbol(h.symbol);
        return (hs && (hs.includes(sym) || sym.includes(hs))) && Math.min(hs.length, sym.length) >= 3;
      });
      if (bySymbolSimilarity) return bySymbolSimilarity;
    }

    // Deterministic fallback: pick the first (oldest) match.
    return matches[0];
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/portfolio`,
        {
          cache: 'no-store',
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
    currentPrice?: number;
    currency?: string;
  }) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/portfolio`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(stock),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setHoldings((prev) => [...prev, data.data]);
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
          cache: 'no-store',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          },
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setHoldings((prev) => prev.filter((h) => h.id !== id));
        toast.success('Stock removed from portfolio');
      } else {
        throw new Error(data.error || 'Failed to delete stock');
      }
    } catch (error) {
      console.error('Error deleting stock:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete stock');
    }
  };

  const handleUpdateStock = async (id: string, patch: Partial<Holding>) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/portfolio/${id}`,
        {
          method: 'PUT',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify(patch),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setHoldings((prev) => prev.map((h) => (h.id === id ? data.data : h)));
        return data.data as Holding;
      }

      throw new Error(data.error || 'Failed to update stock');
    } catch (error) {
      console.error('Error updating stock:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update stock');
      throw error;
    }
  };

  const handleStocksExtracted = (stocks: any[]) => {
    const merged = stocks.map((s: any) => {
      const existing = findExistingHolding(s?.symbol, s?.name);
      if (!existing) return s;

      return {
        ...s,
        symbol: existing.symbol,
        // If we already own it, default to stored purchase price.
        purchasePrice: existing.purchasePrice,
        currency: s.currency || existing.currency,
        valueNOK: typeof s.valueNOK === 'number' ? s.valueNOK : existing.valueNOK,
      };
    });
    setExtractedStocks(merged);
    setShowImportDialog(true);
  };

  const updateExtractedStock = (idx: number, patch: Partial<any>) => {
    setExtractedStocks((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const parseUserNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Accept both "350,80" and "350.80"
    const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  };

  const handleImportStocks = async () => {
    try {
      const missingPurchasePriceNew = extractedStocks.some((s) => {
        const existing = findExistingHolding(s?.symbol, s?.name);
        if (existing) return false;
        const pp = parseUserNumber(s.purchasePrice);
        return pp === null;
      });
      if (missingPurchasePriceNew) {
        toast.error('Please fill in purchase price for new stocks before importing.');
        return;
      }

      for (const stock of extractedStocks) {
        const existing = findExistingHolding(stock.symbol, stock.name);
        const symbol = existing?.symbol ?? (typeof stock.symbol === 'string' ? stock.symbol.trim().toUpperCase() : '');

        const purchasePrice = parseUserNumber(stock.purchasePrice);
        const valueNOK = parseUserNumber(stock.valueNOK);
        const patch: any = {
          symbol,
          name: typeof stock.name === 'string' ? stock.name : '',
          shares: parseUserNumber(stock.shares) ?? 0,
          currentPrice: parseUserNumber(stock.currentPrice) ?? 0,
          dividendYield: parseUserNumber(stock.dividendYield) ?? 0,
          currency: typeof stock.currency === 'string' && stock.currency.trim() ? stock.currency.trim().toUpperCase() : 'UNKNOWN',
          valueNOK: valueNOK,
        };
        // Only include purchasePrice if user explicitly provided a value.
        // For existing holdings, leaving it blank should never overwrite the stored purchasePrice.
        if (typeof stock.purchasePrice === 'number' || (typeof stock.purchasePrice === 'string' && stock.purchasePrice.trim() !== '')) {
          if (purchasePrice !== null) patch.purchasePrice = purchasePrice;
        }

        if (existing) {
          await handleUpdateStock(existing.id, patch);
        } else {
          // For new stocks, purchasePrice must be present due to validation above.
          patch.purchasePrice = patch.purchasePrice ?? 0;
          await handleAddStock(patch);
        }
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
        <AlertDialogContent className="max-h-[85vh] overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle>Import Extracted Stocks?</AlertDialogTitle>
            <AlertDialogDescription>
                We found {extractedStocks.length} stocks in your screenshot. Review and edit the extracted values before importing.
            </AlertDialogDescription>
              <div className="mt-3 space-y-3 max-h-[55vh] overflow-y-auto pr-2">
                {extractedStocks.map((stock, idx) => {
                  const currency = typeof stock.currency === 'string' && stock.currency.trim() ? stock.currency.trim().toUpperCase() : 'UNKNOWN';
                  const purchasePriceMissing = parseUserNumber(stock.purchasePrice) === null;

                  return (
                    <div key={idx} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-foreground">
                          {stock.symbol} <span className="text-muted-foreground font-normal">({currency})</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{stock.name}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <div className="text-xs text-muted-foreground">Shares</div>
                          <input
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            inputMode="decimal"
                            value={stock.shares ?? ''}
                            onChange={(e) => updateExtractedStock(idx, { shares: e.target.value })}
                          />
                        </label>

                        <label className="space-y-1">
                          <div className="text-xs text-muted-foreground">Current price (Siste)</div>
                          <input
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            inputMode="decimal"
                            value={stock.currentPrice ?? ''}
                            onChange={(e) => updateExtractedStock(idx, { currentPrice: e.target.value })}
                          />
                        </label>

                        <label className="space-y-1">
                          <div className="text-xs text-muted-foreground">Purchase price (GAV)</div>
                          <input
                            className={`h-9 w-full rounded-md border bg-background px-3 text-sm ${
                              purchasePriceMissing ? 'border-red-500' : ''
                            }`}
                            inputMode="decimal"
                            value={stock.purchasePrice ?? ''}
                            onChange={(e) => updateExtractedStock(idx, { purchasePrice: e.target.value })}
                            placeholder={purchasePriceMissing ? 'Required' : undefined}
                          />
                        </label>

                        <label className="space-y-1">
                          <div className="text-xs text-muted-foreground">Dividend yield (%)</div>
                          <input
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            inputMode="decimal"
                            value={stock.dividendYield ?? ''}
                            onChange={(e) => updateExtractedStock(idx, { dividendYield: e.target.value })}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
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
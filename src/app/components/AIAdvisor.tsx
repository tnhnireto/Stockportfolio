import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Holding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  purchasePrice: number;
  currentPrice: number;
  dividendYield: number;
}

interface AIAdvisorProps {
  holdings: Holding[];
  projectId: string;
  publicAnonKey: string;
}

export function AIAdvisor({ holdings, projectId, publicAnonKey }: AIAdvisorProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [advice, setAdvice] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (holdings.length === 0) {
      toast.error('Add some stocks to your portfolio first');
      return;
    }

    setAnalyzing(true);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/analyze-portfolio`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ holdings }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to analyze portfolio');
      }

      setAdvice(data.data.advice);
      toast.success('Portfolio analysis complete!');
    } catch (error) {
      console.error('Error analyzing portfolio:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze portfolio');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          AI Portfolio Advisor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Get AI-powered insights and recommendations for your portfolio.
        </p>
        <Button
          onClick={handleAnalyze}
          disabled={analyzing || holdings.length === 0}
          className="w-full"
        >
          {analyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Analyze Portfolio
            </>
          )}
        </Button>
        {advice && (
          <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <div className="whitespace-pre-wrap text-sm">{advice}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

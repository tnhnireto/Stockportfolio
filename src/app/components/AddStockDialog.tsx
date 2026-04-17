import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Plus } from 'lucide-react';

interface AddStockDialogProps {
  onAddStock: (stock: {
    symbol: string;
    name: string;
    shares: number;
    purchasePrice: number;
    dividendYield: number;
  }) => void;
}

export function AddStockDialog({ onAddStock }: AddStockDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    symbol: '',
    name: '',
    shares: '',
    purchasePrice: '',
    dividendYield: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddStock({
      symbol: formData.symbol.toUpperCase(),
      name: formData.name,
      shares: parseFloat(formData.shares),
      purchasePrice: parseFloat(formData.purchasePrice),
      dividendYield: parseFloat(formData.dividendYield) || 0,
    });
    setFormData({
      symbol: '',
      name: '',
      shares: '',
      purchasePrice: '',
      dividendYield: '',
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Add Stock
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Stock to Portfolio</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="symbol">Stock Symbol *</Label>
            <Input
              id="symbol"
              placeholder="e.g., AAPL"
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Company Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Apple Inc."
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shares">Number of Shares *</Label>
            <Input
              id="shares"
              type="number"
              step="any"
              placeholder="e.g., 10"
              value={formData.shares}
              onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purchasePrice">Purchase Price per Share (NOK) *</Label>
            <Input
              id="purchasePrice"
              type="number"
              step="0.01"
              placeholder="e.g., 150.00"
              value={formData.purchasePrice}
              onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dividendYield">Dividend Yield (%)</Label>
            <Input
              id="dividendYield"
              type="number"
              step="0.01"
              placeholder="e.g., 2.5"
              value={formData.dividendYield}
              onChange={(e) => setFormData({ ...formData, dividendYield: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full">
            Add to Portfolio
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
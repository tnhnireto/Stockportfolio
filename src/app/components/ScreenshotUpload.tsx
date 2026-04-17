import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ScreenshotUploadProps {
  onStocksExtracted: (stocks: any[]) => void;
  projectId: string;
  publicAnonKey: string;
}

export function ScreenshotUpload({ onStocksExtracted, projectId, publicAnonKey }: ScreenshotUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate all files are images
    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast.error('Please upload only image files');
      return;
    }

    setUploading(true);
    setProgress({ current: 0, total: files.length });

    const allExtractedStocks: any[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length });

        try {
          // Convert image to base64
          const base64Image = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/upload-screenshot`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify({ imageBase64: base64Image }),
            }
          );

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to process image');
          }

          allExtractedStocks.push(...data.data);
          toast.success(`Processed ${file.name}: ${data.data.length} stocks found`);
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error);
          toast.error(`Failed to process ${file.name}`);
        }
      }

      if (allExtractedStocks.length > 0) {
        toast.success(`Total: Extracted ${allExtractedStocks.length} stocks from ${files.length} image(s)!`);
        onStocksExtracted(allExtractedStocks);
      } else {
        toast.error('No stocks were extracted from the images');
      }
    } catch (error) {
      console.error('Error uploading screenshots:', error);
      toast.error('Failed to upload screenshots');
    } finally {
      setUploading(false);
      setProgress({ current: 0, total: 0 });
    }

    // Reset input
    e.target.value = '';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Portfolio Screenshots</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Upload one or more screenshots from your bank app and AI will automatically extract your portfolio holdings.
          </p>
          <label htmlFor="screenshot-upload">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={uploading}
              onClick={() => document.getElementById('screenshot-upload')?.click()}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing {progress.current}/{progress.total}...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Screenshots
                </>
              )}
            </Button>
          </label>
          <input
            id="screenshot-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </CardContent>
    </Card>
  );
}
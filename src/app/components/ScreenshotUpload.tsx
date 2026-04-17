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

  const upscaleImageDataUrl = async (dataUrl: string): Promise<string> => {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
      });

      // Make small UI text more legible to vision models.
      // Target at least ~1400px wide, cap at 2400px to avoid huge payloads.
      const targetWidth = Math.min(2400, Math.max(1400, img.width * 2));
      const scale = targetWidth / img.width;
      if (!Number.isFinite(scale) || scale <= 1) return dataUrl;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // JPEG is smaller than PNG and usually fine for text screenshots at high quality.
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch {
      return dataUrl;
    }
  };

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
          const base64ImageRaw = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const base64Image = await upscaleImageDataUrl(base64ImageRaw);

          const debugUpload =
            typeof window !== 'undefined' &&
            window.localStorage.getItem('DEBUG_SCREENSHOT_UPLOAD') === '1';

          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-078eec38/upload-screenshot`,
            {
              method: 'POST',
              cache: 'no-store',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`,
              },
              body: JSON.stringify({
                imageBase64: base64Image,
                ...(debugUpload ? { debug: true } : {}),
              }),
            }
          );

          const data = await response.json();

          if (debugUpload) {
            const build = response.headers.get('X-Stockportfolio-Extract-Build');
            console.info('[upload-screenshot] response header X-Stockportfolio-Extract-Build:', build);
            console.info('[upload-screenshot] first row keys (no client-side strip):', data.data?.[0] ? Object.keys(data.data[0]) : []);
            if (data._debug) console.info('[upload-screenshot] server _debug:', data._debug);
          }

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
import { toast } from '@/components/ui/sonner';

export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Clipboard is unavailable');
  }
}

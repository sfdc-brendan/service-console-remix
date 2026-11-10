import { useId, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/console/primitives';

export function EmailReviewDialog({
  subject: initialSubject,
  body: initialBody,
  to,
  description = 'Drafted by AI from the case context. Edit before sending.',
  onCancel,
  onSend,
}: {
  subject: string;
  body: string;
  to?: string | null;
  description?: string;
  onCancel: () => void;
  onSend: (payload: { subject: string; body: string }) => Promise<void>;
}) {
  const id = useId();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);
  return (
    <Dialog open onOpenChange={open => (open ? null : onCancel())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review email draft</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {to ? (
            <p className="text-sm text-muted-foreground">
              To <span className="font-medium text-foreground">{to}</span>
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-subject`}>Subject</Label>
            <Input
              id={`${id}-subject`}
              value={subject}
              onChange={event => setSubject(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-body`}>Message</Label>
            <Textarea
              id={`${id}-body`}
              rows={12}
              value={body}
              onChange={event => setBody(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={sending || !subject.trim() || !body.trim()}
            onClick={async () => {
              setSending(true);
              try {
                await onSend({ subject, body });
              } finally {
                setSending(false);
              }
            }}
          >
            <Mail className="size-4" aria-hidden="true" />{' '}
            {sending ? 'Sending…' : 'Send email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

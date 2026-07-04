'use client';

/**
 * Docked, Gmail-style compose window — recipient chips (To/Cc/Bcc), a rich-text body editor
 * (bold/italic/underline/lists/links via contentEditable), minimize/close, and send. Used by the
 * Mail inbox for new messages, replies and forwards. Sends `body_html` through emailsApi.send
 * (Outlook Mail.Send / Gmail gmail.modify), optionally attaching to a service entity.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Send, X, Minus, Maximize2, Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered, Link as LinkIcon, Paperclip, Trash2, File as FileIcon, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { emailsApi, type EmailAttachmentRef } from '@/lib/crm-api';

type Provider = 'gmail' | 'outlook';
export interface ComposeInit {
  to?: string; cc?: string; subject: string; bodyHtml: string;
  // Threading context (reply): thread this into the original conversation.
  inReplyTo?: string; threadId?: string; replyToProviderId?: string;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function splitEmails(s?: string): string[] {
  return (s || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
}

function RecipientField({ label, emails, setEmails, autoFocus, right }: {
  label: string; emails: string[]; setEmails: (v: string[]) => void; autoFocus?: boolean; right?: React.ReactNode;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const parts = splitEmails(draft);
    if (parts.length) { setEmails([...emails, ...parts]); setDraft(''); }
  };
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border min-h-[40px]">
      <span className="text-xs text-muted-foreground w-8 shrink-0">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1">
        {emails.map((e, i) => (
          <span key={`${e}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            <span className="max-w-[220px] truncate">{e}</span>
            <button onClick={() => setEmails(emails.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ';') { e.preventDefault(); commit(); }
            else if (e.key === 'Backspace' && !draft && emails.length) setEmails(emails.slice(0, -1));
          }}
          onBlur={commit}
          className="flex-1 min-w-[140px] bg-transparent text-sm outline-none py-1"
        />
      </div>
      {right}
    </div>
  );
}

function ToolbarBtn({ onCmd, title, children }: { onCmd: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onCmd(); }}
      className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function ComposeWindow({ init, onClose, provider, entityType, entityId, onSent }: {
  init: ComposeInit | null; onClose: () => void; provider: Provider; entityType?: string; entityId?: string; onSent: () => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachmentRef[]>([]);
  const [uploading, setUploading] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!init) return;
    setTo(splitEmails(init.to));
    setCc(splitEmails(init.cc));
    setBcc([]);
    setShowCcBcc(!!init.cc);
    setSubject(init.subject || '');
    setAttachments([]);
    setMinimized(false);
    // Seed the editor once it's mounted.
    requestAnimationFrame(() => { if (editorRef.current) editorRef.current.innerHTML = init.bodyHtml || ''; });
  }, [init]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      setUploading((u) => u + 1);
      try {
        const ref = await emailsApi.uploadAttachment(file);
        setAttachments((a) => [...a, ref]);
      } catch (e: any) {
        toast.error(e?.message || `Couldn't attach ${file.name}`);
      } finally {
        setUploading((u) => u - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!init) return null;

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    editorRef.current?.focus();
  };
  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (url) exec('createLink', /^https?:\/\//.test(url) ? url : `https://${url}`);
  };

  const send = async () => {
    if (!to.length || !subject.trim()) { toast.error('Add at least one recipient and a subject'); return; }
    const bodyHtml = editorRef.current?.innerHTML || '';
    setSending(true);
    try {
      await emailsApi.send({
        provider, to, cc: cc.length ? cc : undefined, subject: subject.trim(),
        body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#111">${bodyHtml}</div>`,
        entity_type: entityType, entity_id: entityId,
        attachments: attachments.length ? attachments : undefined,
        in_reply_to: init.inReplyTo, thread_id: init.threadId, reply_to_provider_id: init.replyToProviderId,
      });
      toast.success('Email sent');
      onSent();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={cn(
      'fixed z-50 bottom-0 right-4 w-[560px] max-w-[calc(100vw-2rem)] rounded-t-xl border border-border bg-card shadow-2xl flex flex-col',
      minimized ? 'h-11' : 'h-[600px] max-h-[85vh]',
    )}>
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-4 h-11 bg-foreground/[0.06] dark:bg-white/[0.06] rounded-t-xl cursor-pointer select-none"
        onClick={() => setMinimized((m) => !m)}
      >
        <span className="text-sm font-medium truncate">{subject.trim() || 'New message'}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={(e) => { e.stopPropagation(); setMinimized((m) => !m); }} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" title={minimized ? 'Expand' : 'Minimize'}>
            {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-4 w-4" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <RecipientField
            label="To" emails={to} setEmails={setTo} autoFocus={to.length === 0}
            right={!showCcBcc ? (
              <button onClick={() => setShowCcBcc(true)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Cc/Bcc</button>
            ) : undefined}
          />
          {showCcBcc && (
            <>
              <RecipientField label="Cc" emails={cc} setEmails={setCc} />
              <RecipientField label="Bcc" emails={bcc} setEmails={setBcc} />
            </>
          )}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
            <input
              value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {/* Rich-text body */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="flex-1 overflow-y-auto px-4 py-3 text-sm leading-relaxed outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
          />

          {/* Attachment chips */}
          {(attachments.length > 0 || uploading > 0) && (
            <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-border">
              {attachments.map((a, i) => (
                <span key={a.key} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
                  <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-[160px] truncate">{a.name}</span>
                  <span className="text-muted-foreground">{fmtBytes(a.size)}</span>
                  <button onClick={() => setAttachments((list) => list.filter((_, j) => j !== i))} className="opacity-60 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {uploading > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading {uploading}…
                </span>
              )}
            </div>
          )}

          {/* Formatting toolbar */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border">
            <ToolbarBtn title="Bold" onCmd={() => exec('bold')}><Bold className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn title="Italic" onCmd={() => exec('italic')}><Italic className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn title="Underline" onCmd={() => exec('underline')}><UnderlineIcon className="h-4 w-4" /></ToolbarBtn>
            <div className="w-px h-5 bg-border mx-1" />
            <ToolbarBtn title="Bulleted list" onCmd={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn title="Numbered list" onCmd={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></ToolbarBtn>
            <ToolbarBtn title="Insert link" onCmd={addLink}><LinkIcon className="h-4 w-4" /></ToolbarBtn>
            <button title="Attach files" onClick={() => fileRef.current?.click()} className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <Paperclip className="h-4 w-4" />
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2.5 border-t border-border">
            <Button onClick={send} disabled={sending || uploading > 0} className="gap-2">
              {sending ? <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
            <button onClick={onClose} title="Discard" className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted text-muted-foreground">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ComposeWindow;

'use client';

import { useEffect, useState } from 'react';
import PortalShell, { usePortal } from '@/components/tenant/PortalShell';
import {
  getDocuments,
  downloadDocument,
  uploadDocument,
  TenantDocument,
} from '@/lib/tenant/api';
import { useToast } from '@/contexts/TenantToastContext';
import {
  FileText,
  Download,
  Upload,
  Search,
  Filter,
  File,
  Image,
  FileSpreadsheet,
  Loader2,
  X,
  Eye,
  Calendar,
  FolderOpen,
} from 'lucide-react';

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: File,
  docx: File,
  jpg: Image,
  jpeg: Image,
  png: Image,
  xls: FileSpreadsheet,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
};

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'lease', label: 'Lease Documents' },
  { value: 'invoice', label: 'Invoices & Receipts' },
  { value: 'notice', label: 'Notices' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsContent() {
  const { activeTenancy } = usePortal();
  const { addToast } = useToast();
  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const data = await getDocuments();
      setDocuments(data);
    } catch {
      addToast('error', 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (doc: TenantDocument) => {
    setDownloading(doc.id);
    try {
      await downloadDocument(doc.id, doc.fileName || doc.filename || 'document');
      addToast('success', 'Document downloaded');
    } catch {
      addToast('error', 'Failed to download document');
    } finally {
      setDownloading(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !activeTenancy) return;
    setUploading(true);
    try {
      await uploadDocument(activeTenancy.id, uploadFile, uploadCategory, uploadDescription);
      addToast('success', 'Document uploaded successfully');
      setShowUpload(false);
      setUploadFile(null);
      setUploadCategory('other');
      setUploadDescription('');
      loadDocuments();
    } catch {
      addToast('error', 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const filtered = documents.filter(d => {
    if (searchQuery && !(d.fileName || d.filename || '').toLowerCase().includes(searchQuery.toLowerCase()) && !d.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (categoryFilter && d.category !== categoryFilter) return false;
    return true;
  });

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const Icon = FILE_ICONS[ext] || File;
    return <Icon className="w-5 h-5" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="pl-9 pr-8 py-2.5 border border-border rounded-xl text-sm bg-card focus:ring-2 focus:ring-cyan-500 appearance-none">
              {CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 text-foreground rounded-xl text-sm font-medium hover:bg-cyan-700 transition-colors">
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <FolderOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">No documents found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchQuery || categoryFilter ? 'Try adjusting your search or filter' : 'Documents shared with you will appear here'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2.5 bg-muted border-b border-gray-100 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-5">Document</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2">Size</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map(doc => (
              <div key={doc.id} className="px-4 py-3 hover:bg-muted/50 transition-colors">
                <div className="md:grid md:grid-cols-12 md:gap-4 md:items-center space-y-2 md:space-y-0">
                  <div className="col-span-5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600 flex-shrink-0">
                      {getFileIcon(doc.fileName || doc.filename || '')}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName || doc.filename || 'Untitled'}</p>
                      {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground capitalize">
                      {doc.category || 'Other'}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">{doc.fileSize ? formatFileSize(doc.fileSize) : '—'}</div>
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    {doc.previewUrl && (
                      <a href={doc.previewUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-muted-foreground hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </a>
                    )}
                    <button onClick={() => handleDownload(doc)} disabled={downloading === doc.id}
                      className="p-1.5 text-muted-foreground hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors disabled:opacity-50">
                      {downloading === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50" onClick={() => !uploading && setShowUpload(false)}>
          <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Upload Document</h3>
              <button onClick={() => !uploading && setShowUpload(false)} className="p-1 text-muted-foreground hover:text-muted-foreground rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">File</label>
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-cyan-400 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('doc-upload-input')?.click()}>
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-2">
                      {getFileIcon(uploadFile.name)}
                      <span className="text-sm text-gray-700">{uploadFile.name}</span>
                      <button onClick={e => { e.stopPropagation(); setUploadFile(null); }} className="p-0.5 text-muted-foreground hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Click to select a file</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, DOC, DOCX, JPG, PNG, XLS up to 10MB</p>
                    </>
                  )}
                  <input id="doc-upload-input" type="file" className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx,.csv"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm bg-card focus:ring-2 focus:ring-cyan-500 appearance-none">
                  {CATEGORY_OPTIONS.filter(o => o.value).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
                <textarea value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} placeholder="Brief description..."
                  rows={2} className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 resize-none" />
              </div>
              <button onClick={handleUpload} disabled={!uploadFile || uploading}
                className="w-full py-2.5 bg-cyan-600 text-foreground rounded-xl text-sm font-medium hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                {uploading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</span> : 'Upload Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <PortalShell title="Documents">
      <DocumentsContent />
    </PortalShell>
  );
}

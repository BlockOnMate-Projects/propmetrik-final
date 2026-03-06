'use client';

import { useEffect, useState } from 'react';
import PortalShell, { usePortal } from '@/components/portal/PortalShell';
import { getTenantDocuments, uploadTenantDocument, TenantDocument } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import {
  FileText,
  Download,
  Search,
  Filter,
  Eye,
  File,
  FileSpreadsheet,
  Image as ImageIcon,
  ChevronDown,
  Folder,
  Clock,
  Upload,
  X,
  Loader2,
} from 'lucide-react';

const DOC_CATEGORIES: Record<string, { label: string; color: string; bg: string }> = {
  lease: { label: 'Lease', color: 'text-cyan-700', bg: 'bg-cyan-50' },
  invoice: { label: 'Invoice', color: 'text-amber-700', bg: 'bg-amber-50' },
  receipt: { label: 'Receipt', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  notice: { label: 'Notice', color: 'text-purple-700', bg: 'bg-purple-50' },
  report: { label: 'Report', color: 'text-blue-700', bg: 'bg-blue-50' },
  identification: { label: 'ID', color: 'text-gray-700', bg: 'bg-gray-100' },
  other: { label: 'Other', color: 'text-gray-700', bg: 'bg-gray-100' },
};

function getDocIcon(filename: string) {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return FileText;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return ImageIcon;
  return File;
}

function getCategory(docType: string): { label: string; color: string; bg: string } {
  const key = docType?.toLowerCase().replace(/[^a-z]/g, '');
  return DOC_CATEGORIES[key] || DOC_CATEGORIES.other;
}

function DocumentsContent() {
  const { activeTenancy } = usePortal();
  const { addToast } = useToast();
  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState('identification');
  const [uploadTitle, setUploadTitle] = useState('');

  useEffect(() => {
    if (!activeTenancy) { setLoading(false); return; }
    loadDocuments();
  }, [activeTenancy]);

  const loadDocuments = () => {
    if (!activeTenancy) return;
    getTenantDocuments(activeTenancy.id)
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  };

  const handleUpload = async () => {
    if (!uploadFile || !activeTenancy) return;
    setUploading(true);
    try {
      await uploadTenantDocument(activeTenancy.id, uploadFile, uploadType, uploadTitle || uploadFile.name);
      addToast('success', 'Document Uploaded', 'Your document has been submitted to your property manager.');
      setShowUpload(false); setUploadFile(null); setUploadTitle(''); setUploadType('identification');
      loadDocuments();
    } catch (err: any) {
      addToast('error', 'Upload Failed', err.message || 'Could not upload document.');
    } finally { setUploading(false); }
  };

  const categories = ['all', ...Array.from(new Set(documents.map(d => d.documentType?.toLowerCase() || 'other')))];

  const filtered = documents.filter(doc => {
    const docName = doc.fileName || doc.filename || '';
    const matchesSearch = !search || docName.toLowerCase().includes(search.toLowerCase()) || doc.documentType.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'all' || doc.documentType.toLowerCase() === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
          <p className="text-gray-500 text-sm">View and download your lease documents, invoices, and receipts</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium hover:bg-cyan-700 transition-colors shadow-sm">
          <Upload className="w-4 h-4" /> Upload Document
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !uploading && setShowUpload(false)}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Upload Document</h3>
              <button onClick={() => !uploading && setShowUpload(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Document Type</label>
                <select value={uploadType} onChange={e => setUploadType(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500">
                  <option value="identification">Identification (ID / Passport)</option>
                  <option value="receipt">Payment Receipt</option>
                  <option value="lease">Lease Agreement</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Title (optional)</label>
                <input type="text" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="e.g. Ghana Card Front" className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">File</label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-cyan-300 transition-colors">
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-5 h-5 text-cyan-600" />
                      <span className="text-sm font-medium text-gray-700">{uploadFile.name}</span>
                      <button onClick={() => setUploadFile(null)} className="p-0.5 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Click to select a file</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG up to 10MB</p>
                      <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }} />
                    </label>
                  )}
                </div>
              </div>
              <button onClick={handleUpload} disabled={!uploadFile || uploading} className="w-full py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-medium hover:bg-cyan-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                {uploading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</span> : 'Upload Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          />
        </div>
        <div className="relative">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="appearance-none px-4 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{documents.length}</p>
        </div>
        {Object.entries(
          documents.reduce((acc, d) => {
            const key = d.documentType?.toLowerCase() || 'other';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ).slice(0, 3).map(([type, count]) => {
          const cat = getCategory(type);
          return (
            <div key={type} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Document List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="skeleton w-10 h-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton w-48 h-4" />
                  <div className="skeleton w-32 h-3" />
                </div>
                <div className="skeleton w-8 h-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map(doc => {
            const docName = doc.fileName || doc.filename || 'Document';
            const docUrl = doc.fileUrl || doc.downloadUrl;
            const docDate = doc.createdAt || doc.uploadedAt;
            const DocIcon = getDocIcon(docName);
            const cat = getCategory(doc.documentType);
            return (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 p-4">
                  <div className={`w-10 h-10 ${cat.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <DocIcon className={`w-5 h-5 ${cat.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.title || docName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
                        {cat.label}
                      </span>
                      {docDate && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(docDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {docUrl && (
                      <>
                        <button
                          onClick={() => {
                            if (docUrl.startsWith('data:')) {
                              const byteString = atob(docUrl.split(',')[1]);
                              const mimeType = docUrl.split(';')[0].split(':')[1];
                              const ab = new ArrayBuffer(byteString.length);
                              const ia = new Uint8Array(ab);
                              for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                              const blob = new Blob([ab], { type: mimeType });
                              window.open(URL.createObjectURL(blob), '_blank');
                            } else {
                              window.open(docUrl, '_blank');
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                          title="Preview"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (docUrl.startsWith('data:')) {
                              const byteString = atob(docUrl.split(',')[1]);
                              const mimeType = docUrl.split(';')[0].split(':')[1];
                              const ab = new ArrayBuffer(byteString.length);
                              const ia = new Uint8Array(ab);
                              for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                              const blob = new Blob([ab], { type: mimeType });
                              const a = document.createElement('a');
                              a.href = URL.createObjectURL(blob);
                              a.download = docName;
                              a.click();
                            } else {
                              const a = document.createElement('a');
                              a.href = docUrl;
                              a.download = docName;
                              a.click();
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Folder className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-700">
            {search || filterCategory !== 'all' ? 'No documents match your filters' : 'No documents yet'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {search || filterCategory !== 'all' ? 'Try adjusting your search or filter' : 'Documents from your property manager will appear here'}
          </p>
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

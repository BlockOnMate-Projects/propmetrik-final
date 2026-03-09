'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Download,
  Send,
  Eye,
  Search,
  Filter,
  FileSignature,
  FolderOpen,
  Plus,
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
  Clock,
  FileDown,
  Users,
  Stamp,
  Building2,
  Landmark,
  HardHat,
  Banknote,
  Home
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/authed-fetch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

// API base URL
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface TemplateLibraryProps {
  projectId: string;
  onTemplateSelect?: (template: DocumentTemplate) => void;
}

interface DocumentTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  document_type: string;
  file_url: string;
  is_public: boolean;
  is_active: boolean;
  esign_enabled?: boolean;
  esign_roles?: Array<{ name: string; order: number; required: boolean }>;
  created_at: string;
}

interface Signee {
  signee_type: 'internal' | 'external';
  user_id?: string;
  name?: string;
  email?: string;
  role?: string;
}

// Category configuration with Ghana-specific icons and colors
const CATEGORY_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string; description: string }> = {
  land_legal: {
    icon: Landmark,
    color: 'text-amber-600 bg-amber-50',
    label: 'Land & Legal',
    description: 'Title documents, indentures, and land authority consents'
  },
  permits: {
    icon: Stamp,
    color: 'text-blue-600 bg-blue-50',
    label: 'Permits & Approvals',
    description: 'Development permits, EPA, Fire Service, and utility connections'
  },
  contracts: {
    icon: FileText,
    color: 'text-purple-600 bg-purple-50',
    label: 'Contracts',
    description: 'Main contracts, subcontracts, and variation orders'
  },
  site_reports: {
    icon: HardHat,
    color: 'text-orange-600 bg-orange-50',
    label: 'Site Reports',
    description: 'Daily logs, progress reports, and inspection forms'
  },
  financial: {
    icon: Banknote,
    color: 'text-green-600 bg-green-50',
    label: 'Financial',
    description: 'Payment certificates, invoices, and budgets'
  },
  handover: {
    icon: Home,
    color: 'text-teal-600 bg-teal-50',
    label: 'Handover',
    description: 'Snag lists, warranties, and completion certificates'
  },
  other: {
    icon: FolderOpen,
    color: 'text-gray-600 bg-gray-50',
    label: 'Other',
    description: 'Meeting minutes, correspondence, and general documents'
  }
};

// API functions
const templateApi = {
  getTemplates: async (category?: string): Promise<DocumentTemplate[]> => {
    const url = new URL(`${API_URL}/projects/documents/templates`);
    if (category) url.searchParams.set('category', category);
    const response = await authedFetch(url.toString());
    if (!response.ok) throw new Error('Failed to fetch templates');
    return response.json();
  },

  generateFromTemplate: async (
    projectId: string,
    templateId: string,
    options: {
      for_signing?: boolean;
      signees?: Signee[];
      folder_id?: string;
    }
  ) => {
    const response = await authedFetch(`${API_URL}/projects/${projectId}/documents/from-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        ...options
      }),
    });
    if (!response.ok) throw new Error('Failed to generate document');
    return response.json();
  },

  previewTemplate: (templateUrl: string) => {
    window.open(templateUrl, '_blank');
  },

  downloadTemplate: async (template: DocumentTemplate) => {
    const response = await fetch(template.file_url);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name}.${template.file_url.split('.').pop()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// Template Card Component
function TemplateCard({
  template,
  onUse,
  onPreview,
  onDownload
}: {
  template: DocumentTemplate;
  onUse: () => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const categoryConfig = CATEGORY_CONFIG[template.category] || CATEGORY_CONFIG.other;
  const Icon = categoryConfig.icon;

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className={cn('p-2 rounded-lg', categoryConfig.color)}>
            <Icon className="h-5 w-5" />
          </div>
          {template.esign_enabled && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <FileSignature className="h-3 w-3" />
              E-Sign Ready
            </Badge>
          )}
        </div>
        <CardTitle className="text-base mt-3 line-clamp-2">{template.name}</CardTitle>
        <CardDescription className="text-sm line-clamp-2">
          {template.description || 'No description available'}
        </CardDescription>
      </CardHeader>
      <CardFooter className="pt-3 border-t flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onPreview}>
          <Eye className="h-3 w-3 mr-1" />
          Preview
        </Button>
        <Button size="sm" className="flex-1" onClick={onUse}>
          <Plus className="h-3 w-3 mr-1" />
          Use
        </Button>
      </CardFooter>
    </Card>
  );
}

export function TemplateLibrary({ projectId, onTemplateSelect }: TemplateLibraryProps) {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUseDialogOpen, setIsUseDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  
  // E-Sign options
  const [requestSignatures, setRequestSignatures] = useState(false);
  const [signees, setSignees] = useState<Signee[]>([]);

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ['document-templates', selectedCategory === 'all' ? undefined : selectedCategory],
    queryFn: () => templateApi.getTemplates(selectedCategory === 'all' ? undefined : selectedCategory),
  });

  // Generate document mutation
  const generateMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) throw new Error('No template selected');
      return templateApi.generateFromTemplate(projectId, selectedTemplate.id, {
        for_signing: requestSignatures,
        signees: requestSignatures ? signees.filter(s => s.name && s.email) : undefined,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-documents', projectId] });
      toast.success(
        requestSignatures
          ? 'Document created and sent for signatures'
          : 'Document created successfully'
      );
      setIsUseDialogOpen(false);
      resetDialog();
      
      if (onTemplateSelect && selectedTemplate) {
        onTemplateSelect(selectedTemplate);
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to create document: ${error.message}`);
    }
  });

  const resetDialog = () => {
    setSelectedTemplate(null);
    setRequestSignatures(false);
    setSignees([]);
  };

  const handleUseTemplate = (template: DocumentTemplate) => {
    setSelectedTemplate(template);
    
    // Pre-populate signees from template roles if e-sign enabled
    if (template.esign_enabled && template.esign_roles) {
      setSignees(
        template.esign_roles.map(role => ({
          signee_type: 'external' as const,
          name: '',
          email: '',
          role: role.name
        }))
      );
      setRequestSignatures(true);
    } else {
      setSignees([{ signee_type: 'external', name: '', email: '', role: '' }]);
      setRequestSignatures(false);
    }
    
    setIsUseDialogOpen(true);
  };

  const handleAddSignee = () => {
    setSignees([...signees, { signee_type: 'external', name: '', email: '', role: '' }]);
  };

  const handleRemoveSignee = (index: number) => {
    setSignees(signees.filter((_, i) => i !== index));
  };

  const handleSigneeChange = (index: number, field: keyof Signee, value: string) => {
    const updated = [...signees];
    (updated[index] as any)[field] = value;
    setSignees(updated);
  };

  // Filter templates
  const filteredTemplates = templates?.filter(template => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        template.name.toLowerCase().includes(query) ||
        template.description?.toLowerCase().includes(query) ||
        template.document_type.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Group templates by category
  const groupedTemplates = filteredTemplates?.reduce((acc, template) => {
    const cat = template.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, DocumentTemplate[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-600" />
            Document Templates
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Ghana-specific templates for construction and development projects
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Category Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="all" className="text-sm">
            All
          </TabsTrigger>
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const Icon = config.icon;
            return (
              <TabsTrigger key={key} value={key} className="text-sm flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {config.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredTemplates && filteredTemplates.length > 0 ? (
          <div className="mt-6">
            {selectedCategory === 'all' ? (
              // Show grouped by category
              <div className="space-y-8">
                {Object.entries(groupedTemplates || {}).map(([category, categoryTemplates]) => {
                  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
                  const Icon = config.icon;
                  
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={cn('p-2 rounded-lg', config.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{config.label}</h3>
                          <p className="text-sm text-gray-500">{config.description}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {categoryTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onUse={() => handleUseTemplate(template)}
                            onPreview={() => templateApi.previewTemplate(template.file_url)}
                            onDownload={() => templateApi.downloadTemplate(template)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Show flat list for selected category
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onUse={() => handleUseTemplate(template)}
                    onPreview={() => templateApi.previewTemplate(template.file_url)}
                    onDownload={() => templateApi.downloadTemplate(template)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <h3 className="font-medium text-gray-700 mb-2">No Templates Found</h3>
            <p className="text-sm text-gray-500">
              {searchQuery
                ? 'Try adjusting your search or filter criteria'
                : 'No templates available for this category'}
            </p>
          </div>
        )}
      </Tabs>

      {/* Use Template Dialog */}
      <Dialog open={isUseDialogOpen} onOpenChange={(open) => {
        setIsUseDialogOpen(open);
        if (!open) resetDialog();
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Use Template</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Template Info */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <div className={cn(
                'p-2 rounded-lg',
                CATEGORY_CONFIG[selectedTemplate?.category || 'other']?.color || 'bg-gray-100'
              )}>
                {React.createElement(
                  CATEGORY_CONFIG[selectedTemplate?.category || 'other']?.icon || FileText,
                  { className: 'h-5 w-5' }
                )}
              </div>
              <div className="flex-1">
                <h4 className="font-medium">{selectedTemplate?.name}</h4>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedTemplate?.description}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {selectedTemplate?.document_type.replace(/_/g, ' ')}
                  </Badge>
                  {selectedTemplate?.esign_enabled && (
                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                      <FileSignature className="h-3 w-3" />
                      E-Sign Ready
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* E-Sign Option */}
            {selectedTemplate?.esign_enabled && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="request-signatures"
                    checked={requestSignatures}
                    onCheckedChange={(checked) => setRequestSignatures(checked as boolean)}
                  />
                  <label
                    htmlFor="request-signatures"
                    className="text-sm font-medium leading-none flex items-center gap-2"
                  >
                    <FileSignature className="h-4 w-4 text-blue-600" />
                    Request E-Signatures
                  </label>
                </div>

                {requestSignatures && (
                  <div className="space-y-4 pl-6 border-l-2 border-blue-100">
                    <p className="text-sm text-gray-500">
                      Add signers for this document
                    </p>

                    <ScrollArea className="max-h-60">
                      <div className="space-y-3 pr-4">
                        {signees.map((signee, index) => (
                          <div key={index} className="grid grid-cols-3 gap-2 items-end">
                            <div>
                              <Label className="text-xs">Name</Label>
                              <Input
                                placeholder="Full name"
                                value={signee.name || ''}
                                onChange={(e) => handleSigneeChange(index, 'name', e.target.value)}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Email</Label>
                              <Input
                                type="email"
                                placeholder="email@example.com"
                                value={signee.email || ''}
                                onChange={(e) => handleSigneeChange(index, 'email', e.target.value)}
                              />
                            </div>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <Label className="text-xs">Role</Label>
                                <Input
                                  placeholder="Role"
                                  value={signee.role || ''}
                                  onChange={(e) => handleSigneeChange(index, 'role', e.target.value)}
                                />
                              </div>
                              {signees.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="mt-5"
                                  onClick={() => handleRemoveSignee(index)}
                                >
                                  ×
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    <Button variant="outline" size="sm" onClick={handleAddSignee}>
                      <Plus className="mr-2 h-3 w-3" />
                      Add Signee
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : requestSignatures ? (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Create & Send
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add to Project
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ghana Regulatory Info */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Landmark className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h4 className="font-medium text-amber-900 mb-1">Ghana Regulatory Templates</h4>
              <p className="text-sm text-amber-700">
                These templates are designed for Ghana&apos;s regulatory environment including Lands Commission,
                EPA, Metropolitan Assemblies, Ghana Fire Service, GWCL, and ECG requirements. 
                Templates may need customization based on specific assembly requirements.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

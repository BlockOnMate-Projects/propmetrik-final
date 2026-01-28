import React, { useState } from 'react'
import { 
  Banknote, 
  Utensils, 
  CarTaxiFront, 
  Phone, 
  MoreHorizontal,
  Loader2,
  Plus
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { constructionApi } from '@/lib/projects-api'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

interface PettyCashLedgerProps {
  projectId: string
  currency?: string
}

export function PettyCashLedger({ projectId, currency = 'GHS' }: PettyCashLedgerProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    recipientName: '',
    category: 'food',
    description: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const amount = parseFloat(formData.amount)
      await constructionApi.recordPettyCash(projectId, {
        amount,
        currency,
        recipientName: formData.recipientName,
        category: formData.category as any,
        description: formData.description
      })
      
      const successMsg = amount > 500 
         ? 'High-value request sent for approval via WhatsApp'
         : 'Petty cash recorded successfully'
         
      toast.success(successMsg)
      
      setFormData({
        amount: '',
        recipientName: '',
        category: 'food',
        description: ''
      })
    } catch (error) {
      console.error(error)
      toast.error('Failed to record transaction')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-green-500" />
          <CardTitle className="text-white">"Chop Money" Ledger</CardTitle>
        </div>
        <CardDescription className="text-zinc-500">
           Daily subsistence & petty cash. Amounts &gt; 500 {currency} trigger approval alerts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
               <Label className="text-zinc-400 font-mono text-xs">Amount ({currency}) *</Label>
               <Input
                 type="number"
                 placeholder="0.00"
                 value={formData.amount}
                 onChange={e => setFormData({...formData, amount: e.target.value})}
                 className="bg-zinc-800 border-zinc-700 font-mono text-lg text-white"
                 required
                 min="0.1"
                 step="0.1"
               />
            </div>
            <div className="space-y-2">
               <Label className="text-zinc-400 font-mono text-xs">Category</Label>
               <Select
                 value={formData.category}
                 onValueChange={v => setFormData({...formData, category: v})}
               >
                 <SelectTrigger className="bg-zinc-800 border-zinc-700 font-mono text-sm">
                   <div className="flex items-center gap-2">
                     {formData.category === 'transport' && <CarTaxiFront className="h-4 w-4" />}
                     {formData.category === 'food' && <Utensils className="h-4 w-4" />}
                     {formData.category === 'airtime' && <Phone className="h-4 w-4" />}
                     {formData.category === 'tips' && <Banknote className="h-4 w-4" />}
                     {formData.category === 'misc' && <MoreHorizontal className="h-4 w-4" />}
                     <SelectValue />
                   </div>
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="food">Food / Chop Money</SelectItem>
                   <SelectItem value="transport">Transportation</SelectItem>
                   <SelectItem value="airtime">Airtime / Data</SelectItem>
                   <SelectItem value="tips">Tips / Facilitation</SelectItem>
                   <SelectItem value="misc">Miscellaneous</SelectItem>
                 </SelectContent>
               </Select>
            </div>
          </div>

          <div className="space-y-2">
             <Label className="text-zinc-400 font-mono text-xs">Recipient Name *</Label>
             <Input
               placeholder="e.g. Ama Food Vendor"
               value={formData.recipientName}
               onChange={e => setFormData({...formData, recipientName: e.target.value})}
               className="bg-zinc-800 border-zinc-700 font-mono text-sm"
               required
             />
          </div>

          <div className="space-y-2">
             <Label className="text-zinc-400 font-mono text-xs">Description (Optional)</Label>
             <Input
               placeholder="Brief notes..."
               value={formData.description}
               onChange={e => setFormData({...formData, description: e.target.value})}
               className="bg-zinc-800 border-zinc-700 font-mono text-sm"
             />
          </div>

          <Button 
            type="submit" 
            className="w-full bg-green-700 hover:bg-green-800 text-white font-mono"
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Record Cash Out
          </Button>

        </form>
      </CardContent>
    </Card>
  )
}

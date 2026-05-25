import { Tag, Layers } from 'lucide-react'
import { useT } from '../i18n/useT'
import Card from '../components/ui/Card'

export default function Categories() {
  const t = useT()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Layers size={18} className="text-blue-600 flex-shrink-0" />
        <p className="text-sm text-blue-800">{t.categories.description}</p>
      </div>

      <Card className="p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Tag size={28} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700">{t.categories.title}</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{t.categories.comingSoon}</p>
      </Card>
    </div>
  )
}
